import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest, getUserFromRequest } from "@/lib/auth";
import { createFormRequestId } from "@/lib/forms/requestId";
import { sendSubmittedStatusEmail } from "@/lib/forms/email";
import { randomUUID } from "node:crypto";
import { scheduleMosaicWriteSync, stageMosaicWrite, uploadStagedMosaicMedia } from "@/lib/mosaicWriteStore";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req); if (!token) return NextResponse.json({ error: "ClickUp authentication required" }, { status: 401 });
    const form = await req.formData(); const listId = String(form.get("listId") || "");
    if (!listId) return NextResponse.json({ error: "Helpdesk Support Form is not configured yet — please contact IT department." }, { status: 400 });
    const value = (name: string) => String(form.get(name) || "");
    const formRequestId = await createFormRequestId({ token, listId, department: value("department") || "IT", formName: "Helpdesk Support Form" });
    const description = [`# Helpdesk Support Request`, `**Form ID:** ${formRequestId}`, `**Email:** ${value("email")}`, `**Department:** ${value("department")}`, `**Request type:** ${value("jobRequestType")}`, `\n## IT concern\n${value("details")}`, `\n## Remarks\n${value("remarks") || "—"}`, `\n---\nSubmitted by ${value("requestorName")}`].join("\n");
    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to submit this request." }, { status: 401 });
    const taskId = randomUUID();
    const attachments = form.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const record = { id: taskId, name: `IT Helpdesk — ${value("subject")}`, description, formRequestId, requestType: "it-helpdesk-support" };
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "forms", recordId: taskId, listId, recordData: record, operation: "create", method: "POST", resourcePath: `/list/${listId}/task`, requestBody: { name: record.name, description, assignees: [] } });
    scheduleMosaicWriteSync(() => uploadStagedMosaicMedia(token, "forms", taskId, attachments));
    const host = req.headers.get("host") || "localhost:3000";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")}://${host}`;
    const requestor = getUserFromRequest(req);
    try { await sendSubmittedStatusEmail({ recipient: requestor?.email || value("email"), requestorName: requestor?.username || value("requestorName"), department: "IT", formType: "it-helpdesk-support-form", formName: "Helpdesk Support Form", formId: formRequestId, requestTitle: value("subject"), appUrl }); } catch (emailError) { console.warn("Could not send helpdesk confirmation:", emailError); }
    return NextResponse.json({ taskId, taskUrl: "", formRequestId, pendingSync: true }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit helpdesk request." }, { status: 500 }); }
}
