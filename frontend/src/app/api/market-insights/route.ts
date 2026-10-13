import { after, NextRequest, NextResponse } from "next/server";
import { clickUpFetch as fetch } from "@/lib/clickupCalendarApi";
import { getTokenFromRequest } from "@/lib/auth";
import { randomUUID } from "node:crypto";
import { getUserFromRequest } from "@/lib/auth";
import { clickUpScope, queueClickUpSync, readClickUpTaskSnapshot } from "@/lib/clickupReadStore";
import { processClickUpSyncQueue } from "@/lib/clickupSync";
import { MARKET_INSIGHTS_LIST_ID } from "@/lib/marketInsights";
import { readStagedMosaicRecords, stageMosaicWrite, scheduleMosaicWriteSync } from "@/lib/mosaicWriteStore";

export const maxDuration = 60;

type Sector = "industrial" | "retail";

type Article = { sector: Sector; date: string; company: string; event: string; implications: string; source: string };
type InsightTask = { id?: string | number; url?: string; text_content?: string; description?: string; markdown_description?: string };
type ArticleRecord = Article & { id: string; url: string };

function tokenFor(req: NextRequest) {
  return getTokenFromRequest(req);
}

function normalise(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

function articleFrom(value: unknown): Article | null {
  const source = value && typeof value === "object" ? value as Partial<Article> : {};
  const sector = normalise(source.sector).toLowerCase();
  if ((sector !== "industrial" && sector !== "retail") || !normalise(source.date) || !normalise(source.company) || !normalise(source.event)) return null;
  return { sector, date: normalise(source.date), company: normalise(source.company), event: normalise(source.event), implications: normalise(source.implications), source: normalise(source.source) } as Article;
}

function descriptionFor(article: Article) {
  return JSON.stringify({ echoMarketInsight: article }, null, 2);
}

function parseTask(task: InsightTask): ArticleRecord | null {
  const text = task.text_content || task.description || task.markdown_description || "";
  try {
    const parsed = JSON.parse(text);
    const article = articleFrom(parsed?.echoMarketInsight);
    if (article) return { id: String(task.id), url: task.url || "", ...article };
  } catch {}
  const source = String(text);
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const article = articleFrom(JSON.parse(source.slice(start, end + 1))?.echoMarketInsight);
      if (article) return { id: String(task.id), url: task.url || "", ...article };
    } catch {}
  }
  return null;
}

async function listTasks(token: string) {
  const response = await fetch(`https://api.clickup.com/api/v2/list/${MARKET_INSIGHTS_LIST_ID}/task?include_closed=true&include_markdown_description=true&page=0`, { headers: { Authorization: token }, cache: "no-store" });
  if (!response.ok) throw new Error("Unable to read the Market Insights archive from ClickUp.");
  const body = await response.json() as { tasks?: InsightTask[] };
  return (body.tasks || []).map(parseTask).filter((article): article is ArticleRecord => article !== null);
}

async function listArticles(token: string, snapshot: Awaited<ReturnType<typeof readClickUpTaskSnapshot>> = null) {
  const remote = snapshot
    ? snapshot.tasks.map((task) => parseTask(task as InsightTask)).filter((article): article is ArticleRecord => article !== null)
    : await listTasks(token);
  const staged = await readStagedMosaicRecords(clickUpScope(token), "market_insights", MARKET_INSIGHTS_LIST_ID);
  const articles = new Map<string, ArticleRecord>();
  for (const article of remote) articles.set(article.id, article);
  for (const row of staged) {
    const remoteId = String(row.clickup_id || row.record_id);
    if (row.is_deleted) { articles.delete(remoteId); articles.delete(String(row.record_id)); continue; }
    const data = row.record_data && typeof row.record_data === "object" ? row.record_data as Record<string, unknown> : {};
    const article = articleFrom(data);
    if (article) articles.set(remoteId, { id: remoteId, url: String(data.url || (row.clickup_id ? `https://app.clickup.com/t/${row.clickup_id}` : "")), ...article });
  }
  return [...articles.values()];
}

function ownerId(req: NextRequest) { return String(getUserFromRequest(req)?.id || ""); }

export async function GET(req: NextRequest) {
  const token = tokenFor(req);
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  try {
    const scope = clickUpScope(token);
    const snapshot = await readClickUpTaskSnapshot(scope, MARKET_INSIGHTS_LIST_ID, 30 * 24 * 60 * 60_000);
    const articles = await listArticles(token, snapshot);
    const userId = ownerId(req);
    if (userId && (!snapshot || snapshot.syncState !== "ready" || Date.now() - Date.parse(snapshot.syncedAt) > 5 * 60_000)) {
      after(async () => {
        try { if (await queueClickUpSync(token, userId, MARKET_INSIGHTS_LIST_ID)) await processClickUpSyncQueue(1); }
        catch (error) { console.warn("[market-insights-sync] refresh could not be queued", error instanceof Error ? error.message : "unknown"); }
      });
    }
    return NextResponse.json({ listId: MARKET_INSIGHTS_LIST_ID, articles });
  }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load Market Insights." }, { status: 502 }); }
}

export async function POST(req: NextRequest) {
  const token = tokenFor(req);
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  try {
    const body = await req.json();
    if (Array.isArray(body.articles)) {
      const incoming = (body.articles as unknown[]).map(articleFrom).filter((article): article is Article => Boolean(article));
      if (!incoming.length) return NextResponse.json({ error: "No valid article records were supplied." }, { status: 400 });
      const existing = await listArticles(token);
      const known = new Set(existing.map((item) => `${item?.date}|${item?.company}`.toLowerCase()));
      const created: Array<{ id: string; } & Article> = [];
      for (const article of incoming) {
        const key = `${article.date}|${article.company}`.toLowerCase();
        if (known.has(key)) continue;
        const localId = randomUUID();
        const userId = ownerId(req);
        if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to save insights." }, { status: 401 });
        const requestBody = { name: `${article.date} · ${article.company}`, description: descriptionFor(article), tags: ["market-insight", article.sector] };
        await stageMosaicWrite({ token, ownerUserId: userId, domain: "market_insights", recordId: localId, listId: MARKET_INSIGHTS_LIST_ID, recordData: { id: localId, ...article } as never, operation: "create", method: "POST", resourcePath: `/list/${MARKET_INSIGHTS_LIST_ID}/task`, requestBody });
        created.push({ id: localId, ...article });
        known.add(key);
      }
      if (created.length) scheduleMosaicWriteSync();
      return NextResponse.json({ success: true, created, skipped: incoming.length - created.length, pendingSync: true }, { status: created.length ? 202 : 200 });
    }
    const article = articleFrom(body);
    if (!article) return NextResponse.json({ error: "Sector, date, company, and event are required." }, { status: 400 });
    const localId = randomUUID();
    const userId = ownerId(req);
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to save insights." }, { status: 401 });
    const requestBody = { name: `${article.date} · ${article.company}`, description: descriptionFor(article), tags: ["market-insight", article.sector] };
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "market_insights", recordId: localId, listId: MARKET_INSIGHTS_LIST_ID, recordData: { id: localId, ...article } as never, operation: "create", method: "POST", resourcePath: `/list/${MARKET_INSIGHTS_LIST_ID}/task`, requestBody });
    scheduleMosaicWriteSync();
    return NextResponse.json({ success: true, article: { id: localId, ...article }, pendingSync: true }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save Market Insight." }, { status: 502 }); }
}

export async function PATCH(req: NextRequest) {
  const token = tokenFor(req);
  if (!token) return NextResponse.json({ error: "ClickUp authentication required." }, { status: 401 });
  try {
    const body = await req.json() as { id?: unknown; [key: string]: unknown }; const article = articleFrom(body); if (!body.id || !article) return NextResponse.json({ error: "A complete article record is required." }, { status: 400 });
    const userId = ownerId(req);
    if (!userId) return NextResponse.json({ error: "Your ClickUp profile is required to update insights." }, { status: 401 });
    const staged = await readStagedMosaicRecords(clickUpScope(token), "market_insights", MARKET_INSIGHTS_LIST_ID);
    const current = staged.find((row) => String(row.record_id) === String(body.id) || String(row.clickup_id) === String(body.id));
    const recordId = String(current?.record_id || body.id);
    await stageMosaicWrite({ token, ownerUserId: userId, domain: "market_insights", recordId, listId: MARKET_INSIGHTS_LIST_ID, recordData: { id: recordId, ...article } as never, operation: "update", method: "PUT", resourcePath: `/task/${String(current?.clickup_id || body.id)}`, requestBody: { name: `${article.date} · ${article.company}`, description: descriptionFor(article) } });
    scheduleMosaicWriteSync();
    return NextResponse.json({ success: true, article: { id: recordId, ...article }, pendingSync: true }, { status: 202 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update Market Insight." }, { status: 502 }); }
}
