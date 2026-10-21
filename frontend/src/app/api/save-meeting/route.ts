import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { clickUpFetch as fetch } from "@/lib/clickupCalendarApi";
import { getUserFromRequest } from "@/lib/auth";
import { randomUUID } from "node:crypto";
import { scheduleMosaicWriteSync, stageMosaicWrite } from "@/lib/mosaicWriteStore";
import { serializeMeetingContent } from "@/lib/meetingArchive";

export async function POST(req: NextRequest) {
  try {
    const { meeting_details, items = [], action_items = [], other_discussions, transcript, meeting_notes } = await req.json();

    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: "ClickUp authentication required" }, { status: 401 });
    const isConfidential = Boolean(meeting_details.is_confidential || meeting_details.isConfidential);
    const targetListId = meeting_details.list_id || meeting_details.meeting_list_id || meeting_details.meetingArchiveListId;
    const spaceId = meeting_details.space_id || meeting_details.spaceId;

    if (!targetListId && !spaceId) {
      return NextResponse.json({ error: "Select a ClickUp Space or List before archiving this meeting." }, { status: 400 });
    }

    const headers = { Authorization: token, "Content-Type": "application/json" };
    let list: any = null;
    let spaceName = meeting_details.space_name || "";

    if (targetListId) {
      const listRes = await fetch(`https://api.clickup.com/api/v2/list/${targetListId}`, { headers });
      if (listRes.ok) {
        list = await listRes.json();
        spaceName = list.space?.name || spaceName || "Personal List";
      } else if (!spaceId) {
        throw new Error("Specified ClickUp list could not be found or is inaccessible.");
      }
    }

    if (!list && spaceId) {
      const listsRes = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/list`, { headers });
      if (!listsRes.ok) throw new Error("Unable to read ClickUp lists for this Space.");
      const lists = await listsRes.json();
      const spaceRes = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}`, { headers }).catch(() => null);
      const spaceData = spaceRes?.ok ? await spaceRes.json().catch(() => ({})) : {};
      spaceName = spaceData.name || meeting_details.space_name || `Space ${spaceId}`;
      list = (lists.lists || []).find((item: any) => item.name.toLowerCase() === "mosaic meetings")
        || (lists.lists || []).find((item: any) => item.name.toLowerCase() === "echo meetings");
      if (!list) {
        const createList = await fetch(`https://api.clickup.com/api/v2/space/${spaceId}/list`, { method: "POST", headers, body: JSON.stringify({ name: "Mosaic Meetings", content: "Mosaic meeting archive" }) });
        if (!createList.ok) {
          const detail = await createList.text();
          throw new Error(`Unable to create Mosaic Meetings list in ClickUp (${createList.status}): ${detail || createList.statusText}`);
        }
        list = await createList.json();
      }
    }
    const teamAtt = meeting_details.prime_attendees || meeting_details.team_attendees || (Array.isArray(meeting_details.attendees_prime) ? meeting_details.attendees_prime.join(", ") : "");
    const extAtt = meeting_details.external_attendees || (Array.isArray(meeting_details.attendees_external) ? meeting_details.attendees_external.join(", ") : "");
    const effectiveNotes = meeting_notes || meeting_details.meeting_notes || "";
    const description = [
      `# Meeting Details`,
      `**Date:** ${meeting_details.date || ""}`,
      `**Start:** ${meeting_details.start_time || ""}`,
      `**End:** ${meeting_details.end_time || ""}`,
      `**Owner:** ${meeting_details.prepared_by || meeting_details.owner || "Unassigned"}`,
      `**Department:** ${meeting_details.department || meeting_details.workspace || "Unassigned"}`,
      `**Location:** ${meeting_details.location || ""}`,
      ...(meeting_details.recording_type ? [`**Recording Type:** ${meeting_details.recording_type}`] : []),
      ...(meeting_details.recording_format ? [`**Recording Format:** ${meeting_details.recording_format}`] : []),
      ...(teamAtt ? [`**Team Attendees:** ${teamAtt}`] : []),
      ...(extAtt ? [`**External Attendees:** ${extAtt}`] : []),
      `\n# Executive Summary\n${other_discussions || ""}`,
      ...(effectiveNotes ? [`\n# Meeting Notes\n${effectiveNotes}`] : []),
      `\n# Discussion Points\n${serializeMeetingContent(items, action_items)}`,
      `\n# Full Transcript\n${(transcript || "").substring(0, 20000)}`
    ].join("\n");
    const meetingDate = meeting_details.date || new Date().toISOString().slice(0, 10);
    const meetingName = meeting_details.client_name || "Mosaic Meeting";
    // Detect available statuses for this list to match the workspace workflow
    let availableStatuses: { status: string; type?: string }[] = Array.isArray(list.statuses) ? list.statuses : [];
    if (!availableStatuses.length) {
      const listDetailRes = await fetch(`https://api.clickup.com/api/v2/list/${list.id}`, { headers }).catch(() => null);
      if (listDetailRes?.ok) {
        const listDetail = await listDetailRes.json().catch(() => ({}));
        if (Array.isArray(listDetail.statuses)) {
          availableStatuses = listDetail.statuses;
        }
      }
    }

    // Find the best matching status:
    // 1. "completed ontime" if configured in the workspace
    // 2. Any closed/done status
    // 3. Any status with "complete", "closed", or "done"
    // 4. Default to standard "closed" or "complete"
    const hasCompletedOntime = availableStatuses.some(
      (s) => s.status?.toLowerCase() === "completed ontime" || /completed\s*ontime/i.test(s.status || "")
    );
    const closedStatus = availableStatuses.find(
      (s) => s.type?.toLowerCase() === "closed" || s.type?.toLowerCase() === "done"
    )?.status;
    const generalCompleteStatus = availableStatuses.find(
      (s) => /(complete|closed|done)/i.test(s.status || "")
    )?.status;

    const preferredStatus = hasCompletedOntime
      ? "completed ontime"
      : closedStatus || generalCompleteStatus || (availableStatuses[availableStatuses.length - 1]?.status);

    const tags = isConfidential
      ? ["echo", "private", "meeting-archive"]
      : ["echo", "meeting-archive"];

    const basePayload = {
      name: `${meetingDate} — ${meetingName}`,
      description,
      assignees: [],
      tags,
    };

    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to archive this meeting." }, { status: 401 });
    const taskId = randomUUID();
    const requestBody = { ...basePayload };
    const meetingRecord = {
      meeting_id: taskId,
      client_name: meetingName,
      meeting_date: meetingDate,
      meeting_type: meeting_details.meeting_type || "Internal",
      location: meeting_details.location || "",
      summary_md: other_discussions || "",
      transcript_md: (transcript || "").substring(0, 20_000),
      meeting_notes: effectiveNotes,
      table_items: items || [],
      meeting_details: { ...meeting_details, list_id: String(list.id), list_name: String(list.name || ""), space_name: spaceName },
      description,
      status: preferredStatus || "default",
    };
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "meetings", recordId: taskId, listId: String(list.id), recordData: meetingRecord as never, operation: "create", method: "POST", resourcePath: `/list/${String(list.id)}/task`, requestBody });
    if (preferredStatus) await stageMosaicWrite({ token, ownerUserId: userId, domain: "meetings", recordId: taskId, listId: String(list.id), recordData: meetingRecord as never, operation: "update", method: "PUT", resourcePath: `/task/${taskId}`, requestBody: { status: preferredStatus } });
    scheduleMosaicWriteSync();

    return NextResponse.json({
      status: "success",
      message: isConfidential ? "Meeting saved to your private archive and queued to sync." : "Meeting saved and queued to sync.",
      meeting_id: taskId,
      clickup: {
        workspace: meeting_details.workspace || "Current workspace",
        department: isConfidential ? "Private" : (meeting_details.department || "Unassigned"),
        spaceId: String(spaceId || list?.space?.id || ""),
        spaceName,
        listName: list.name,
        listId: list.id,
        taskId,
        taskUrl: "",
        archiveStatus: preferredStatus || "default",
        isConfidential,
      },
      pendingSync: true,
    }, { status: 202 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
