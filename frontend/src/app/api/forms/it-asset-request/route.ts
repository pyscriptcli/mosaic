import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest, getUserFromRequest } from "@/lib/auth";
import { createFormRequestId } from "@/lib/forms/requestId";
import { sendSubmittedStatusEmail } from "@/lib/forms/email";
import { randomUUID } from "node:crypto";
import { scheduleMosaicWriteSync, stageMosaicWrite, uploadStagedMosaicMedia } from "@/lib/mosaicWriteStore";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: "ClickUp authentication required" }, { status: 401 });
    const form = await req.formData();
    const listId = String(form.get("listId") || "");
    if (!listId) return NextResponse.json({ error: "IT Asset Request Form is not configured yet — please contact IT department." }, { status: 400 });
    const value = (name: string) => String(form.get(name) || "");
    const title = value("title");
    const formRequestId = await createFormRequestId({ token, listId, department: value("department") || "IT", formName: "IT Asset Request Form" });
    const description = [`# IT Asset Request`, `**Form ID:** ${formRequestId}`, `**Request title:** ${title}`, `**Employee:** ${value("employeeName")}`, `**Department:** ${value("department")}`, `**Asset type:** ${value("assetType")}`, `**Needed by:** ${value("neededBy")}`, `**Assignee:** ${value("assignee")}`, `**Team leader approval:** ${form.get("tlApproval") ? "Confirmed" : "Pending"}`, `\n## Reason for request\n${value("reason")}`, `\n## Remarks\n${value("remarks")}`, `\n---\nSubmitted by ${value("requestorName")} (${value("requestorEmail")})`].join("\n");
    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to submit this request." }, { status: 401 });
    const taskId = randomUUID();
    const attachments = form.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const taskName = `IT Asset Request — ${title}`;
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "forms", recordId: taskId, listId, recordData: { id: taskId, name: taskName, description, formRequestId, requestType: "it-asset-request" }, operation: "create", method: "POST", resourcePath: `/list/${listId}/task`, requestBody: { name: taskName, description, assignees: [] } });
    scheduleMosaicWriteSync(() => uploadStagedMosaicMedia(token, "forms", taskId, attachments));
    const host = req.headers.get("host") || "localhost:3000";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")}://${host}`;
    const requestor = getUserFromRequest(req);
    try { await sendSubmittedStatusEmail({ recipient: requestor?.email || value("requestorEmail"), requestorName: requestor?.username || value("requestorName") || value("employeeName"), department: "IT", formType: "it-asset-request-form", formName: "IT Asset Request Form", formId: formRequestId, requestTitle: title, appUrl }); } catch (emailError) { console.warn("Could not send IT asset request confirmation:", emailError); }
    return NextResponse.json({ taskId, taskUrl: "", formRequestId, pendingSync: true }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit IT asset request." }, { status: 500 }); }
}
