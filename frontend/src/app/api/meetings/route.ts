import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getTokenFromRequest, getUserFromRequest } from "@/lib/auth";
import { parseMeetingContent, serializeMeetingContent } from "@/lib/meetingArchive";
import { clickUpCalendarFetch, clickUpFetch as fetch, fetchAllClickUpListTasks } from "@/lib/clickupCalendarApi";
import { scheduleMosaicWriteSync, stageMosaicWrite } from "@/lib/mosaicWriteStore";

export const maxDuration = 60;

function meetingDescription(meeting: any) {
  const details = [
    "# Meeting Details",
    `**Meeting:** ${meeting.title || "Executive Meeting"}`,
    `**Date:** ${meeting.date || ""}`,
    `**Type:** ${meeting.meeting_type || ""}`,
    `**Start Time:** ${meeting.start_time || "—"}`,
    `**End Time:** ${meeting.end_time || "—"}`,
    `**Duration:** ${meeting.duration_minutes ? `${meeting.duration_minutes} mins` : meeting.duration_seconds ? `${Math.round(meeting.duration_seconds / 60)} mins` : "—"}`,
    `**Location:** ${meeting.location || ""}`,
    ...(meeting.recording_type ? [`**Recording Type:** ${meeting.recording_type}`] : []),
    ...(meeting.recording_format ? [`**Recording Format:** ${meeting.recording_format}`] : []),
    `**Team attendees:** ${(meeting.attendees_prime || []).join(", ") || "—"}`,
    `**External attendees:** ${(meeting.attendees_external || []).join(", ") || "—"}`,
    "\n# Executive Summary",
    meeting.summary || "—",
    ...(meeting.meeting_notes ? ["\n# Meeting Notes", meeting.meeting_notes] : []),
    "\n# Discussion Points",
    serializeMeetingContent(meeting.items || [], meeting.action_items || []),
    "\n# Full Transcript",
    meeting.transcript || "—",
  ];
  return details.join("\n");
}

function changeSummary(before: any, after: any) {
  const fields = [
    ["title", "meeting title"], 
    ["date", "date"], 
    ["start_time", "start time"],
    ["end_time", "end time"],
    ["duration_minutes", "duration"],
    ["meeting_type", "meeting type"], 
    ["location", "location"], 
    ["summary", "summary"], 
    ["meeting_notes", "meeting notes"],
    ["transcript", "full transcript"]
  ];
  const changes = fields.filter(([field]) => JSON.stringify(before?.[field]) !== JSON.stringify(after?.[field])).map(([, label]) => label);
  if (JSON.stringify(before?.items) !== JSON.stringify(after?.items)) changes.push("discussion points");
  if (JSON.stringify(before?.action_items) !== JSON.stringify(after?.action_items)) changes.push("action items");
  if (JSON.stringify(before?.attendees_prime) !== JSON.stringify(after?.attendees_prime) || JSON.stringify(before?.attendees_external) !== JSON.stringify(after?.attendees_external)) changes.push("attendees");
  return changes.length ? changes.join(", ") : "meeting archive";
}

function isMeetingArchiveList(name?: string): boolean {
  if (!name) return false;
  const n = name.trim().toLowerCase();
  return (
    n === "echo meetings" ||
    n === "echo meeting" ||
    n === "meetings archive" ||
    n === "meeting archive" ||
    n === "meetings archives" ||
    n === "meeting archives" ||
    n.includes("meeting archive") ||
    n.includes("echo meeting")
  );
}

function parseMeetingTask(task: any, spaceId: string, spaceName: string, list: any): any {
  const match = String(task.name || "").match(/^(\d{4}-\d{2}-\d{2})\s+—\s+(.*)$/);
  const description = task.description || "";
  const section = (name: string, next?: string) => {
    const pattern = new RegExp(`# ${name}\\r?\\n([\\s\\S]*?)${next ? `(?=\\r?\\n# ${next})` : "$"}`);
    return description.match(pattern)?.[1]?.trim() || "";
  };

  const locMatch = description.match(/\*\*Location:\*\*\s*(.*)/);
  const primeMatch = description.match(/\*\*Team [Aa]ttendees:\*\*\s*(.*)/);
  const extMatch = description.match(/\*\*External [Aa]ttendees:\*\*\s*(.*)/);

  const attendeesPrime = primeMatch?.[1]
    ? primeMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean)
    : [];
  const attendeesExternal = extMatch?.[1]
    ? extMatch[1].split(",").map((s: string) => s.trim()).filter(Boolean)
    : [];

  const tags = Array.isArray(task.tags)
    ? task.tags.map((t: any) => (typeof t === "string" ? t : t.name || "").toLowerCase())
    : [];

  const isConfidential = Boolean(
    list?.isPersonal ||
    spaceId === "__personal__" ||
    tags.includes("private") ||
    tags.includes("confidential")
  );

  const taskSpaceId = spaceId && spaceId !== "__all__" ? String(spaceId) : (task.space?.id ? String(task.space.id) : "");
  const taskSpaceName = isConfidential
    ? "Personal List"
    : (spaceName && spaceName !== "All Spaces" ? spaceName : (task.space?.name || "Workspace"));
  const taskListId = list?.id ? String(list.id) : (task.list?.id ? String(task.list.id) : "");
  const taskListName = list?.name || task.list?.name || (isConfidential ? "Personal List" : "Mosaic Meetings");
  
  const startMatch = description.match(/\*\*Start(?: Time)?:\*\*\s*(.*)/i);
  const endMatch = description.match(/\*\*End(?: Time)?:\*\*\s*(.*)/i);
  const startTime = startMatch?.[1]?.trim() && startMatch[1].trim() !== "—" ? startMatch[1].trim() : undefined;
  const endTime = endMatch?.[1]?.trim() && endMatch[1].trim() !== "—" ? endMatch[1].trim() : undefined;

  const durMatch = description.match(/\*\*Duration:\*\*\s*(\d+)\s*mins?/i);
  const durationMinutes = durMatch ? parseInt(durMatch[1], 10) : undefined;

  const recTypeMatch = description.match(/\*\*Recording Type:\*\*\s*(.*)/i);
  const recFormatMatch = description.match(/\*\*Recording Format:\*\*\s*(.*)/i);
  const parsedRecType = recTypeMatch?.[1]?.trim().toLowerCase();
  const recordingType = (parsedRecType === "video" || parsedRecType === "audio")
    ? (parsedRecType as "audio" | "video")
    : (description.toLowerCase().includes("video recording") || description.toLowerCase().includes("screen recording") ? "video" : undefined);
  const recordingFormat = recFormatMatch?.[1]?.trim().toLowerCase();

  const hasNotesSection = /# Meeting Notes\r?\n/.test(description);
  const summary = hasNotesSection
    ? section("Executive Summary", "Meeting Notes")
    : section("Executive Summary", "Discussion Points");
  const meetingNotes = hasNotesSection ? section("Meeting Notes", "Discussion Points") : "";

  const content = parseMeetingContent(section("Discussion Points", "Full Transcript"));
  return {
    id: String(task.id),
    meeting_id: String(task.id),
    title: match?.[2] || task.name || "Mosaic Meeting",
    date: match?.[1] || (task.date_created ? new Date(Number(task.date_created)).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)),
    meeting_type: "Internal",
    start_time: startTime,
    end_time: endTime,
    location: locMatch?.[1]?.trim() || "",
    attendees_prime: attendeesPrime.length > 0 ? attendeesPrime : ["Dave Policarpio"],
    attendees_external: attendeesExternal,
    summary,
    meeting_notes: meetingNotes,
    recording_type: recordingType,
    recording_format: recordingFormat,
    items: content.items,
    action_items: content.action_items,
    transcript: section("Full Transcript"),
    created_at: task.date_created ? new Date(Number(task.date_created)).toISOString() : new Date().toISOString(),
    clickup_space_id: taskSpaceId,
    clickup_space_name: taskSpaceName,
    clickup_list_id: taskListId,
    clickup_list_name: taskListName,
    clickup_task_url: task.url || `https://app.clickup.com/t/${task.id}`,
    archive_status: task.status?.status || "completed ontime",
    is_confidential: isConfidential,
    duration_minutes: durationMinutes,
    duration_seconds: durationMinutes ? durationMinutes * 60 : undefined,
  };
}

async function getPersonalListForUser(req: NextRequest): Promise<{ id: string; name: string } | null> {
  const urlParam = req.nextUrl.searchParams.get("personalListId");
  const headerParam = req.headers.get("x-personal-list-id");
  if (urlParam) return { id: urlParam, name: "Personal List" };
  if (headerParam) return { id: headerParam, name: "Personal List" };

  const user = getUserFromRequest(req);
  const email = user?.email?.toLowerCase().trim();
  if (!email) return null;

  const url = process.env.SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
  if (!url || !key) return null;

  try {
    const supabase = createClient(url, key);
    const { data: prefData } = await supabase
      .from("echo_user_preferences")
      .select("preferences")
      .eq("email", email)
      .maybeSingle();
    if (prefData?.preferences?.personal_list_id) {
      return {
        id: prefData.preferences.personal_list_id,
        name: prefData.preferences.personal_list_name || "Personal List"
      };
    }

    const { data: globalData } = await supabase
      .from("echo_forms_config")
      .select("config")
      .eq("id", "global")
      .maybeSingle();
    const userPrefs = globalData?.config?.userPreferences?.[email];
    if (userPrefs?.personal_list_id) {
      return {
        id: userPrefs.personal_list_id,
        name: userPrefs.personal_list_name || "Personal List"
      };
    }
  } catch (e) {
    // Non-blocking
  }
  return null;
}

async function fetchMeetingsFromPersonalList(personalList: { id: string; name: string }, token: string): Promise<any[]> {
  try {
    const [listRes, tasksRes] = await Promise.all([
      clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/list/${personalList.id}`, undefined, undefined, { skipCache: true }).catch(() => null),
      fetchAllClickUpListTasks<Record<string, any>>(token, personalList.id, { includeMarkdownDescription: true }).catch(() => null),
    ]);
    const listData = listRes?.ok ? await listRes.json().catch(() => ({})) : {};
    const listName = listData.name || personalList.name || "Personal List";
    const spaceName = listData.space?.name || "Personal List";
    const spaceId = listData.space?.id ? String(listData.space.id) : "__personal__";

    if (!tasksRes) return [];
    const tasks = tasksRes;

    const meetingTasks = tasks.filter((t: any) => {
      const tags = Array.isArray(t.tags) ? t.tags.map((tg: any) => (typeof tg === "string" ? tg : tg.name || "").toLowerCase()) : [];
      if (tags.includes("meeting-archive") || tags.includes("echo") || tags.includes("private")) return true;
      if (/^\d{4}-\d{2}-\d{2}\s+—\s+/.test(t.name || "")) return true;
      const desc = t.description || "";
      if (desc.includes("# Meeting Details") || desc.includes("# Executive Summary")) return true;
      return false;
    });

    return meetingTasks.map((t: any) =>
      parseMeetingTask(t, spaceId, spaceName, { id: personalList.id, name: listName, isPersonal: true })
    );
  } catch (err) {
    console.warn("Failed to read tasks for personal list:", err);
    return [];
  }
}

async function fetchMeetingsFromWorkspace(teamId: string, token: string, spaceId?: string | null): Promise<any[]> {
  const params = new URLSearchParams({
    include_closed: "true",
    subtasks: "true",
    include_markdown_description: "true",
  });
  params.append("tags[]", "meeting-archive");
  if (spaceId && spaceId !== "__all__") {
    params.append("space_ids[]", spaceId);
  }

  try {
    const tasks: any[] = [];
    for (let page = 0; ; page += 1) {
      params.set("page", String(page));
      const res = await clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/team/${teamId}/task?${params.toString()}`, undefined, undefined, { skipCache: true });
      if (!res.ok) throw new Error(`ClickUp workspace task search returned ${res.status}.`);
      const data = await res.json() as { tasks?: any[] };
      const batch = Array.isArray(data.tasks) ? data.tasks : [];
      tasks.push(...batch);
      if (batch.length < 100) break;
    }
    return tasks.map((task) => parseMeetingTask(task, task.space?.id || spaceId || "", task.space?.name || "Workspace", task.list || {}));
  } catch (err) {
    console.warn("Tag-based workspace task query failed:", err);
  }
  return [];
}

async function fetchMeetingsFromSpaceLegacy(spaceId: string, token: string): Promise<any[]> {
  const [spaceRes, listsRes, foldersRes] = await Promise.all([
    clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/space/${spaceId}`, undefined, undefined, { skipCache: true }).catch(() => null),
    clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/space/${spaceId}/list`, undefined, undefined, { skipCache: true }).catch(() => null),
    clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/space/${spaceId}/folder`, undefined, undefined, { skipCache: true }).catch(() => null),
  ]);

  const spaceData = spaceRes?.ok ? await spaceRes.json().catch(() => ({})) : {};
  const spaceName = spaceData.name || `Space ${spaceId}`;

  const targetLists: Array<{ id: string; name: string }> = [];

  if (listsRes?.ok) {
    const listsData = await listsRes.json().catch(() => ({}));
    for (const l of listsData.lists || []) {
      if (isMeetingArchiveList(l.name)) {
        targetLists.push({ id: String(l.id), name: l.name });
      }
    }
  }

  if (foldersRes?.ok) {
    const foldersData = await foldersRes.json().catch(() => ({}));
    for (const f of foldersData.folders || []) {
      for (const l of f.lists || []) {
        if (isMeetingArchiveList(l.name)) {
          targetLists.push({ id: String(l.id), name: l.name });
        }
      }
    }
  }

  if (targetLists.length === 0) return [];

  const allTasksArrays = await Promise.all(
    targetLists.map(async (list) => {
      try {
        const tasks = await fetchAllClickUpListTasks<Record<string, any>>(token, list.id, { includeMarkdownDescription: true });
        return tasks.map((task) => parseMeetingTask(task, spaceId, spaceName, list));
      } catch (e) {
        return [];
      }
    })
  );

  return allTasksArrays.flat();
}

export async function GET(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    const searchParams = new URL(req.url).searchParams;
    const spaceId = searchParams.get("spaceId");
    const isPersonalOnly = spaceId === "__personal__";
    const isAll = searchParams.get("all") === "true" || !spaceId || spaceId === "__all__";
    const personalList = await getPersonalListForUser(req);

    if (token) {
      // 1. User specifically requests Personal List meetings
      if (isPersonalOnly) {
        if (!personalList) {
          return NextResponse.json({
            status: "success",
            meetings: [],
            count: 0,
            notice: "No personal ClickUp list configured"
          });
        }
        const personalMeetings = await fetchMeetingsFromPersonalList(personalList, token);
        personalMeetings.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        return NextResponse.json({
          status: "success",
          meetings: personalMeetings,
          count: personalMeetings.length
        });
      }

      // 2. Specific Space selected
      if (!isAll && spaceId) {
        const [tagMeetings, legacyMeetings] = await Promise.all([
          // Check teams for tag-based query filtered by space_id
          (async () => {
            const teamsRes = await fetch("https://api.clickup.com/api/v2/team", { headers: { Authorization: token }, cache: "no-store" }).catch(() => null);
            if (!teamsRes?.ok) return [];
            const teamsData = await teamsRes.json().catch(() => ({}));
            const results = await Promise.all(
              (teamsData.teams || []).map((team: any) => fetchMeetingsFromWorkspace(team.id, token, spaceId))
            );
            return results.flat();
          })(),
          fetchMeetingsFromSpaceLegacy(spaceId, token),
        ]);

        const combined = [...tagMeetings, ...legacyMeetings];
        const unique = Array.from(new Map(combined.map((m: any) => [m.id, m])).values());
        unique.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

        return NextResponse.json({
          status: "success",
          meetings: unique,
          count: unique.length
        });
      }

      // 3. All meetings: Discover workspace meetings via tag + legacy lists + Personal List
      try {
        const teamsRes = await fetch("https://api.clickup.com/api/v2/team", {
          headers: { Authorization: token },
          cache: "no-store"
        });

        if (teamsRes.ok) {
          const teamsData = await teamsRes.json();
          const teams = teamsData.teams || [];

          // Parallel query: Tag-based workspace search + Personal list tasks + Space legacy fallback
          const [teamTasksArrays, personalMeetings, legacyMeetingsArray] = await Promise.all([
            Promise.all(teams.map((team: any) => fetchMeetingsFromWorkspace(team.id, token))),
            personalList ? fetchMeetingsFromPersonalList(personalList, token) : Promise.resolve([]),
            // Legacy space discovery fallback to ensure no historic untagged meetings are missed
            (async () => {
              const spaceIds: string[] = [];
              for (const team of teams) {
                const spacesRes = await fetch(`https://api.clickup.com/api/v2/team/${team.id}/space`, {
                  headers: { Authorization: token },
                  cache: "no-store"
                }).catch(() => null);
                if (spacesRes?.ok) {
                  const sData = await spacesRes.json().catch(() => ({}));
                  for (const s of sData.spaces || []) spaceIds.push(String(s.id));
                }
              }
              const spaceResults = await Promise.all(
                spaceIds.map((sId) => fetchMeetingsFromSpaceLegacy(sId, token))
              );
              return spaceResults.flat();
            })()
          ]);

          const allMeetings = [
            ...teamTasksArrays.flat(),
            ...personalMeetings,
            ...legacyMeetingsArray
          ];

          // Deduplicate by meeting ID
          const uniqueMeetings = Array.from(
            new Map(allMeetings.map((m: any) => [m.id, m])).values()
          );
          uniqueMeetings.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

          return NextResponse.json({
            status: "success",
            meetings: uniqueMeetings,
            count: uniqueMeetings.length
          });
        }
      } catch (clickUpAllErr) {
        console.warn("ClickUp all-space discovery encountered an issue:", clickUpAllErr);
      }
    }

    return NextResponse.json({
      status: "success",
      meetings: []
    });
  } catch (err: any) {
    return NextResponse.json({
      status: "error",
      error: err.message,
      meetings: []
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const meeting = body.meeting;
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: "ClickUp authentication required" }, { status: 401 });
    if (!meeting?.id) return NextResponse.json({ error: "Meeting archive is missing its ClickUp task ID." }, { status: 400 });
    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to update this archive." }, { status: 401 });

    const url = process.env.SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";

    if (!url || !key) return NextResponse.json({ error: "Meeting storage is unavailable. Try again." }, { status: 503 });
    const supabase = createClient(url, key);
    const payload = {
      meeting_id: meeting.meeting_id || meeting.id,
      client_name: meeting.title || "Executive Meeting",
      meeting_date: meeting.date,
      meeting_type: meeting.meeting_type || "Internal",
      location: meeting.location || "",
      summary_md: meeting.summary || "",
      transcript_md: (meeting.transcript || "").substring(0, 5000),
      table_items: meeting.items || [],
    };
    const { error: archiveError } = await supabase.from("meeting_archives").upsert(payload, { onConflict: "meeting_id" });
    if (archiveError) throw new Error("Could not save the meeting in Supabase.");
    const taskPayload = {
      name: `${meeting.date || new Date().toISOString().slice(0, 10)} — ${meeting.title || "Mosaic Meeting"}`,
      description: meetingDescription(meeting),
    };
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "meetings", recordId: String(meeting.id), recordData: meeting as never, operation: "update", method: "PUT", resourcePath: `/task/${String(meeting.id)}`, requestBody: taskPayload });
    scheduleMosaicWriteSync();
    return NextResponse.json({ status: "success", meeting, pendingSync: true }, { status: 202 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const token = getTokenFromRequest(req);
    if (!token) return NextResponse.json({ error: "ClickUp authentication required" }, { status: 401 });

    const searchParams = new URL(req.url).searchParams;
    let meetingId = searchParams.get("meetingId") || searchParams.get("id");

    if (!meetingId) {
      try {
        const body = await req.json();
        meetingId = body.meetingId || body.id;
      } catch {}
    }

    if (!meetingId) {
      return NextResponse.json({ error: "Meeting ID is required for deletion." }, { status: 400 });
    }
    const userId = String(getUserFromRequest(req)?.id || "");
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to delete this archive." }, { status: 401 });

    const url = process.env.SUPABASE_URL || "";
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || "";
    if (!url || !key) return NextResponse.json({ error: "Meeting storage is unavailable. Try again." }, { status: 503 });
    const supabase = createClient(url, key);
    const { error: deleteError } = await supabase.from("meeting_archives").delete().eq("meeting_id", meetingId);
    if (deleteError) throw new Error("Could not delete the meeting from Supabase.");
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "meetings", recordId: meetingId, recordData: {}, operation: "delete", method: "DELETE", resourcePath: `/task/${meetingId}` });
    scheduleMosaicWriteSync();

    return NextResponse.json({
      status: "success",
      pendingSync: true,
      message: "Meeting archive deleted successfully.",
      meetingId
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete meeting." }, { status: 500 });
  }
}
