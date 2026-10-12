import { NextRequest, NextResponse } from "next/server";
import { FormType } from "@/types/forms/rfp";
import {
  createClickUpTask,
  updateClickUpTask,
  uploadAttachmentToTask,
} from "@/lib/forms/clickup";
import { sendApproverNotification, sendRequestorStatusNotification } from "@/lib/forms/email";
import { getTokenFromRequest } from "@/lib/auth";
import { getUserFromRequest } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import { createFormRequestId } from "@/lib/forms/requestId";
import { requireFeature } from "@/lib/access-control-server";
import { scheduleMosaicWriteSync, uploadStagedMosaicMedia } from "@/lib/mosaicWriteStore";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const denied = await requireFeature(req, "forms-submit");
    if (denied) return denied;
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ success: false, message: "ClickUp authentication required" }, { status: 401 });
    const formData = await req.formData();
    const dataStr = formData.get("data") as string;
    const formType = ((formData.get("formType") as string) || "rfp") as FormType;
    const mappedListId = formData.get("listId")?.toString();

    if (!dataStr) {
      return NextResponse.json(
        { success: false, message: "Missing form data payload" },
        { status: 400 }
      );
    }

    const data: any = JSON.parse(dataStr);
    data.__clickupToken = token;
    if (mappedListId) data.__clickupListId = mappedListId;
    if (!data.taskId && mappedListId) {
      const formName = formType === "po" ? "Purchase Order" : formType === "pcv" ? "Petty Cash Voucher" : "Request for Payment";
      data.formRequestId = await createFormRequestId({
        token,
        listId: mappedListId,
        department: data.department || "Finance",
        formName,
      });
    }
    const sessionUser = getUserFromRequest(req);
    if (!sessionUser?.id) return NextResponse.json({ success: false, message: "Your signed-in profile is required to submit this form." }, { status: 401 });
    data.__ownerUserId = sessionUser?.id ? String(sessionUser.id) : "";
    if (sessionUser?.email) {
      data.requestedByName = sessionUser.username || data.requestedByName;
      data.requestedByEmail = sessionUser.email;
      const supabaseUrl = process.env.SUPABASE_URL || "";
      const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
      if (supabaseUrl && supabaseKey && sessionUser.email.toLowerCase() !== "dave.policarpio@primephilippines.com") {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const configRes = await supabase.from("echo_forms_config").select("config").eq("id", "global").maybeSingle();
        const config = configRes.data?.config;
        const member = config?.members?.find((item: any) => item.active !== false && String(item.email).toLowerCase() === sessionUser.email.toLowerCase());
        const admin = config?.admins?.some((item: any) => item.active !== false && String(item.email).toLowerCase() === sessionUser.email.toLowerCase());
        if (!admin && (!member || (member.department && member.department !== data.department))) return NextResponse.json({ success: false, message: "You can only submit forms for your assigned department." }, { status: 403 });
      }
    }

    // Determine application base URL
    const host = req.headers.get("host") || "localhost:3000";
    const protocol = req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https");
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;

    let taskResult;
    const isRevision = Boolean(data.taskId);

    if (isRevision && data.taskId) {
      taskResult = await updateClickUpTask(data.taskId, data, appUrl, formType);
    } else {
      taskResult = await createClickUpTask(data, appUrl, formType);
    }

    const taskId = taskResult.id;

    if (taskId) {
      const typeLabel = formType.toUpperCase();
      const entityName = formType === "po" ? (data.vendorName || "Vendor") : (data.payee || "Payee");
      const sanitizedName = entityName.replace(/[^a-zA-Z0-9_-]/g, "_");

      const stagedMedia: File[] = [];
      const pendingSync = Boolean(taskResult.pendingSync);

      // 1. Upload high-res visual preview image of the form (appears in ClickUp right sidebar)
      const previewImageBlob = formData.get("previewImage") as File | null;
      if (previewImageBlob) {
        const previewFilename = `${typeLabel}_${sanitizedName}_Preview.png`;
        if (pendingSync) stagedMedia.push(new File([previewImageBlob], previewFilename, { type: previewImageBlob.type }));
        else await uploadAttachmentToTask(taskId, previewImageBlob, previewFilename, { token });
      }

      // 2. Upload official generated PDF document
      const pdfBlob = formData.get("pdf") as File | null;
      if (pdfBlob) {
        const pdfFilename = `${typeLabel}_${sanitizedName}_${data.date || "document"}.pdf`;
        if (pendingSync) stagedMedia.push(new File([pdfBlob], pdfFilename, { type: pdfBlob.type }));
        else await uploadAttachmentToTask(taskId, pdfBlob, pdfFilename, { token });
      }

      // 3. Upload all supporting documents
      const supportingFiles = formData.getAll("supportingFiles") as File[];
      if (supportingFiles && supportingFiles.length > 0) {
        for (const file of supportingFiles) {
          if (file && file.size > 0) {
            if (pendingSync) stagedMedia.push(file);
            else await uploadAttachmentToTask(taskId, file, file.name, { token });
          }
        }
      }
      if (pendingSync) scheduleMosaicWriteSync(() => uploadStagedMosaicMedia(token, "forms", taskId, stagedMedia));

      // 4. Dispatch Outlook email notification to Approver if applicable
      if (formType === "rfp" && (data.approverEmail || data.approverName || data.approvedByName)) {
        try {
          await sendApproverNotification({
            approverEmail: data.approverEmail,
            approverName: data.approverName || data.approvedByName,
            data,
            taskId,
            appUrl,
          });
        } catch (emailErr) {
          console.warn("Could not dispatch approver notification email:", emailErr);
        }
      }

      const requestorEmail = sessionUser?.email || data.requestedByEmail || data.requestorEmail || data.email || "";
      console.info(`[Email] Requestor notification queued for ${requestorEmail || "<missing email>"} on task ${taskId}`);
      if (requestorEmail) {
        try {
          const now = new Date();
          const formName = formType === "po" ? "Purchase Order" : formType === "pcv" ? "Petty Cash Voucher" : "Request for Payment";
          const emailResult = await sendRequestorStatusNotification({
            recipient: requestorEmail,
            event: "submitted",
            department: "Finance",
            formType,
            values: {
              requestor_first_name: String(data.requestedByName || "Team Member").split(" ")[0],
              form_name: formName,
              form_id: data.formRequestId || taskId,
              department: data.department || "Finance",
              status_label: "Submitted",
              request_title: data.payee || data.vendorName || formName,
              amount: Number(data.totalAmount || 0).toLocaleString("en-PH", { style: "currency", currency: "PHP" }),
              purpose: data.purpose || "",
              submitted_at: now.toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
              status_updated_at: now.toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
              current_stage: "Submitted",
              current_stage_started_at: now.toLocaleString("en-PH", { timeZone: "Asia/Manila" }),
              status_message: "Your request was received and is awaiting review.",
              next_step_message: "",
              track_status_url: `${appUrl}/forms?tab=track`,
            },
          });
          if (!emailResult.success) console.error(`[Email] Requestor notification failed for task ${taskId}: ${emailResult.error || "unknown error"}`);
        } catch (emailErr) {
          console.warn("Could not dispatch requestor status email:", emailErr);
        }
      } else {
        console.error(`[Email] Requestor notification skipped for task ${taskId}: no requestor email was present in the authenticated session or form payload.`);
      }
    }

    const docName = formType === "po" ? "Purchase Order (PO)" : formType === "pcv" ? "Petty Cash Voucher (PCV)" : "Request for Payment (RFP)";

    return NextResponse.json({
      success: true,
      taskId: taskResult.id,
      formRequestId: data.formRequestId,
      taskUrl: taskResult.url,
      isMock: taskResult.isMock || false,
      pendingSync: Boolean(taskResult.pendingSync),
      message: taskResult.pendingSync
        ? `${docName} was saved and will sync in the background.`
        : isRevision ? `${docName} revised and updated in ClickUp successfully!` : `${docName} submitted and created in ClickUp successfully!`,
      taskData: taskResult,
    }, { status: taskResult.pendingSync ? 202 : 200 });
  } catch (error: any) {
    console.error("Error in /api/rfp/submit:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || "Internal server error submitting RFP to ClickUp",
      },
      { status: 500 }
    );
  }
}
