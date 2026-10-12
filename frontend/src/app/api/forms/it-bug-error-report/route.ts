import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest, getUserFromRequest } from "@/lib/auth";
import { createFormRequestId } from "@/lib/forms/requestId";
import { sendSubmittedStatusEmail } from "@/lib/forms/email";
import { scheduleMosaicWriteSync, stageMosaicWrite, uploadStagedMosaicMedia } from "@/lib/mosaicWriteStore";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: "ClickUp authentication required" }, { status: 401 });
    const form = await req.formData();
    const listId = String(form.get("listId") || "");
    if (!/^\d+$/.test(listId)) return NextResponse.json({ error: "Bug/Error Report Form is not configured yet — please contact IT department." }, { status: 400 });
    const value = (name: string) => String(form.get(name) || "");
    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to submit this report." }, { status: 401 });
    const formRequestId = await createFormRequestId({ token, listId, department: value("department") || "IT", formName: "Bug Error Report Form" });
    const description = [`# Bug/Error Report`, `**Form ID:** ${formRequestId}`, `**Email:** ${value("email")}`, `**Department:** ${value("department")}`, `\n## Issue description\n${value("issueDescription")}`, `\n---\nSubmitted by ${value("requestorName")}`].join("\n");
    const taskId = randomUUID();
    const taskName = `Bug Report — ${value("issueName")}`;
    const attachments = form.getAll("attachments").filter((entry): entry is File => entry instanceof File && entry.size > 0);
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "forms", recordId: taskId, listId, recordData: { id: taskId, name: taskName, description, formRequestId, requestType: "it-bug-error-report" }, operation: "create", method: "POST", resourcePath: `/list/${listId}/task`, requestBody: { name: taskName, description, assignees: [] } });
    scheduleMosaicWriteSync(() => uploadStagedMosaicMedia(token, "forms", taskId, attachments));
    const host = req.headers.get("host") || "localhost:3000";
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || `${req.headers.get("x-forwarded-proto") || (host.includes("localhost") ? "http" : "https")}://${host}`;
    const requestor = getUserFromRequest(req);
    try {
      await sendSubmittedStatusEmail({ recipient: requestor?.email || value("email"), requestorName: requestor?.username || value("requestorName"), department: "IT", formType: "it-bug-error-report-form", formName: "Bug/Error Report Form", formId: formRequestId, requestTitle: value("issueName"), appUrl });
    } catch (emailError) { console.warn("Could not send bug report confirmation:", emailError); }
    return NextResponse.json({ taskId, taskUrl: "", formRequestId, pendingSync: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to submit bug report." }, { status: 500 });
  }
}
