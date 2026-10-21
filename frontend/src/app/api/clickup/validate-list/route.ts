import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth";
import { clickUpFetch as fetch } from "@/lib/clickupCalendarApi";
import { extractClickUpListId } from "@/lib/clickupList";

export async function POST(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) {
      return NextResponse.json({ valid: false, error: "ClickUp authentication required" }, { status: 401 });
    }

    const { input } = await req.json();
    if (!input || typeof input !== "string") {
      return NextResponse.json({ valid: false, error: "No ClickUp list URL or ID provided" }, { status: 400 });
    }

    const listId = extractClickUpListId(input);
    if (!listId) {
      return NextResponse.json({ valid: false, error: "Could not extract a valid list ID from input" }, { status: 400 });
    }

    const res = await fetch(`https://api.clickup.com/api/v2/list/${listId}`, {
      headers: {
        Authorization: token,
      },
    });

    if (!res.ok) {
      return NextResponse.json(
        { valid: false, error: `ClickUp list not found or inaccessible (${res.status}).` },
        { status: 404 }
      );
    }

    const data = await res.json();
    return NextResponse.json({
      valid: true,
      list: {
        id: data.id,
        name: data.name,
        space: {
          id: data.space?.id,
          name: data.space?.name,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { valid: false, error: error.message || "Failed to validate ClickUp list" },
      { status: 500 }
    );
  }
}
