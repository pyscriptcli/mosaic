import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest, getUserFromRequest } from "@/lib/auth";
import { clickUpFetch as fetch } from "@/lib/clickupCalendarApi";
import { scheduleMosaicWriteSync, stageMosaicWrite } from "@/lib/mosaicWriteStore";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ error: "ClickUp authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const {
      meetingId,
      destinationListId,
      sourceListId,
      isConfidential,
      destinationSpaceId,
      destinationSpaceName,
      destinationListName,
    } = body;

    if (!meetingId || !destinationListId) {
      return NextResponse.json(
        { error: "meetingId and destinationListId are required." },
        { status: 400 }
      );
    }

    const headers = {
      Authorization: token,
      "Content-Type": "application/json",
    };

    // 1. Fetch current task details to get team_id and current home list
    const taskRes = await fetch(`https://api.clickup.com/api/v2/task/${meetingId}`, {
      headers,
      cache: "no-store",
    });

    if (!taskRes.ok) {
      const errText = await taskRes.text().catch(() => "");
      return NextResponse.json(
        { error: `ClickUp task not found or inaccessible (${taskRes.status}): ${errText}` },
        { status: taskRes.status }
      );
    }

    const taskData = await taskRes.json();
    const currentListId = sourceListId || taskData.list?.id;
    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to move this archive." }, { status: 401 });
    const projected = {
      id: meetingId,
      clickup_list_id: String(destinationListId),
      clickup_list_name: destinationListName || (isConfidential ? "Personal List" : "Mosaic Meetings"),
      clickup_space_id: destinationSpaceId || (isConfidential ? "__personal__" : ""),
      clickup_space_name: destinationSpaceName || (isConfidential ? "Personal List" : "Workspace"),
      is_confidential: Boolean(isConfidential),
    };
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "meetings", recordId: String(meetingId), listId: String(destinationListId), recordData: projected, operation: "update", method: "POST", resourcePath: `/list/${destinationListId}/task/${meetingId}`, requestBody: {} });
    if (currentListId && String(currentListId) !== String(destinationListId)) {
      await stageMosaicWrite({ token, ownerUserId: userId, domain: "meetings", recordId: String(meetingId), listId: String(destinationListId), recordData: projected, operation: "update", method: "DELETE", resourcePath: `/list/${currentListId}/task/${meetingId}` });
    }
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "meetings", recordId: String(meetingId), listId: String(destinationListId), recordData: projected, operation: "update", method: isConfidential ? "POST" : "DELETE", resourcePath: "/task/" + meetingId + "/tag/private" });
    const auditComment = isConfidential
      ? `Mosaic archive relocated to Personal/Private List: ${destinationListName || "Personal List"}.`
      : `Mosaic archive relocated to ${destinationSpaceName || "Space"} › ${destinationListName || "List"}.`;
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "meetings", recordId: String(meetingId), listId: String(destinationListId), recordData: projected, operation: "update", method: "POST", resourcePath: `/task/${meetingId}/comment`, requestBody: { comment_text: auditComment, notify_all: false } });
    scheduleMosaicWriteSync();

    return NextResponse.json({
      status: "success",
      message: "Meeting archive relocated successfully.",
      meeting: {
        ...projected,
      },
      pendingSync: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to move meeting archive." },
      { status: 500 }
    );
  }
}
