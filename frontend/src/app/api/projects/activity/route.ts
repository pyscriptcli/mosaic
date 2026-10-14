import { NextRequest, NextResponse } from 'next/server';
import { getTokenFromRequest } from '@/lib/auth';
import { clickUpCalendarFetch } from '@/lib/clickupCalendarApi';
import { readProjectActivity } from '@/lib/projectActivity';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const token = getTokenFromRequest(request);
  if (!token) return NextResponse.json({ error: 'Sign in with ClickUp to view project activity.' }, { status: 401 });
  const folderId = request.nextUrl.searchParams.get('folderId') || '';
  const listId = request.nextUrl.searchParams.get('listId') || '';
  if (!/^\d+$/.test(folderId) || (listId && !/^\d+$/.test(listId))) return NextResponse.json({ error: 'A valid project and subproject are required.' }, { status: 400 });
  try {
    const [folderResult, activitiesResult] = await Promise.allSettled([
      clickUpCalendarFetch(token, `https://api.clickup.com/api/v2/folder/${folderId}`),
      readProjectActivity(folderId, listId || undefined),
    ]);
    if (folderResult.status === 'rejected') throw folderResult.reason;
    const folderResponse = folderResult.value;
    if (!folderResponse.ok) return NextResponse.json({ error: 'This project is not available to your ClickUp account.' }, { status: folderResponse.status });
    if (activitiesResult.status === 'rejected') throw activitiesResult.reason;
    const activities = activitiesResult.value;
    return NextResponse.json({ activities }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[Project activity] Could not load activity feed:', error);
    return NextResponse.json({ error: 'Project activity storage is not ready. Apply supabase/project_activity.sql and try again.' }, { status: 503 });
  }
}
