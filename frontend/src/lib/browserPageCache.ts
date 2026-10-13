"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

type CacheRecord = { id: string; ownerId: string; key: string; data: unknown; updatedAt: string };
export type QuerySnapshot<T> = { data?: T; loading: boolean; refreshing: boolean; error?: string; updatedAt?: string };

const DB_NAME = "mosaic-page-data";
const DB_VERSION = 1;
const STORE_NAME = "records";
const memory = new Map<string, QuerySnapshot<unknown>>();
const listeners = new Map<string, Set<() => void>>();
const inFlight = new Map<string, Promise<unknown>>();
const refetchers = new Map<string, () => Promise<unknown>>();
const EMPTY: QuerySnapshot<never> = Object.freeze({ loading: false, refreshing: false });
const INITIAL_LOADING: QuerySnapshot<never> = Object.freeze({ loading: true, refreshing: false });
let dbPromise: Promise<IDBDatabase | null> | null = null;

function recordId(ownerId: string, key: string) { return `${ownerId}:${key}`; }

function notify(id: string) { listeners.get(id)?.forEach((listener) => listener()); }

function publish<T>(id: string, snapshot: QuerySnapshot<T>) {
  memory.set(id, snapshot as QuerySnapshot<unknown>);
  notify(id);
}

function openDatabase() {
  if (dbPromise) return dbPromise;
  if (typeof window === "undefined" || !window.indexedDB) return Promise.resolve(null);
  dbPromise = new Promise((resolve) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("ownerId", "ownerId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

async function readRecord(ownerId: string, key: string): Promise<CacheRecord | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(recordId(ownerId, key));
    request.onsuccess = () => resolve((request.result as CacheRecord | undefined) || null);
    request.onerror = () => resolve(null);
  });
}

async function writeRecord(ownerId: string, key: string, data: unknown) {
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ id: recordId(ownerId, key), ownerId, key, data, updatedAt: new Date().toISOString() } satisfies CacheRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}

function shareUnchanged(previous: unknown, next: unknown): unknown {
  if (Object.is(previous, next)) return previous;
  if (Array.isArray(previous) && Array.isArray(next) && previous.length === next.length) {
    const previousById = new Map<string, unknown>();
    if (previous.every((item) => item && typeof item === "object" && "id" in item)) {
      for (const item of previous) previousById.set(String((item as { id: unknown }).id), item);
    }
    let changed = false;
    const result = next.map((value, index) => {
      const nextId = value && typeof value === "object" && "id" in value ? String((value as { id: unknown }).id) : "";
      const oldValue = nextId ? previousById.get(nextId) : previous[index];
      const shared = shareUnchanged(oldValue, value);
      if (shared !== previous[index]) changed = true;
      return shared;
    });
    return changed ? result : previous;
  }
  if (previous && next && typeof previous === "object" && typeof next === "object" && !Array.isArray(previous) && !Array.isArray(next)) {
    const oldRecord = previous as Record<string, unknown>;
    const nextRecord = next as Record<string, unknown>;
    const oldKeys = Object.keys(oldRecord);
    const nextKeys = Object.keys(nextRecord);
    if (oldKeys.length !== nextKeys.length || nextKeys.some((key) => !(key in oldRecord))) return next;
    let changed = false;
    const result: Record<string, unknown> = {};
    for (const key of nextKeys) {
      result[key] = shareUnchanged(oldRecord[key], nextRecord[key]);
      if (result[key] !== oldRecord[key]) changed = true;
    }
    return changed ? result : previous;
  }
  return next;
}

async function hydrate<T>(ownerId: string, key: string) {
  const id = recordId(ownerId, key);
  if (memory.get(id)?.data !== undefined) return;
  const record = await readRecord(ownerId, key);
  if (!record || memory.get(id)?.data !== undefined) return;
  publish(id, { data: record.data as T, loading: false, refreshing: false, updatedAt: record.updatedAt });
}

async function refresh<T>(ownerId: string, key: string, load: () => Promise<T>): Promise<T | undefined> {
  const id = recordId(ownerId, key);
  const active = inFlight.get(id);
  if (active) return active as Promise<T>;
  const previous = memory.get(id) as QuerySnapshot<T> | undefined;
  publish(id, { ...previous, loading: previous?.data === undefined, refreshing: previous?.data !== undefined, error: undefined });
  const operation = (async () => {
    try {
      const response = await load();
      const current = memory.get(id) as QuerySnapshot<T> | undefined;
      const shared = shareUnchanged(current?.data, response) as T;
      const updatedAt = new Date().toISOString();
      if (shared !== current?.data) {
        publish(id, { data: shared, loading: false, refreshing: false, updatedAt });
        await writeRecord(ownerId, key, shared);
      } else {
        publish(id, { ...current, loading: false, refreshing: false, updatedAt });
      }
      return shared;
    } catch (error) {
      const current = memory.get(id) as QuerySnapshot<T> | undefined;
      const status = error && typeof error === "object" && "status" in error ? Number((error as { status: unknown }).status) : 0;
      if (status === 401 || status === 403) {
        await clearBrowserPageCache(ownerId);
        publish(id, { loading: false, refreshing: false, error: error instanceof Error ? error.message : "Access is no longer available." });
        return undefined;
      }
      publish(id, { ...current, loading: false, refreshing: false, error: error instanceof Error ? error.message : "Unable to refresh this page." });
      return undefined;
    } finally {
      inFlight.delete(id);
    }
  })();
  inFlight.set(id, operation);
  return operation;
}

export function useBrowserPageQuery<T>(ownerId: string | undefined, key: string, load: () => Promise<T>, enabled = true) {
  const id = ownerId ? recordId(ownerId, key) : "";
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; }, [load]);
  const subscribe = useCallback((listener: () => void) => {
    if (!id) return () => undefined;
    const group = listeners.get(id) || new Set<() => void>();
    group.add(listener);
    listeners.set(id, group);
    return () => { group.delete(listener); if (group.size === 0) listeners.delete(id); };
  }, [id]);
  const getSnapshot = useCallback(() => id ? memory.get(id) as QuerySnapshot<T> || INITIAL_LOADING as QuerySnapshot<T> : EMPTY as QuerySnapshot<T>, [id]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY as QuerySnapshot<T>);

  useEffect(() => {
    if (!enabled || !ownerId) return;
    let active = true;
    const refetch = () => refresh(ownerId, key, () => loadRef.current());
    refetchers.set(id, refetch);
    void (async () => {
      await hydrate<T>(ownerId, key);
      if (active) void refresh(ownerId, key, () => loadRef.current());
    })();
    return () => { active = false; if (refetchers.get(id) === refetch) refetchers.delete(id); };
  }, [enabled, key, ownerId]);

  const refreshNow = useCallback(() => ownerId ? refresh(ownerId, key, () => loadRef.current(),) : Promise.resolve(undefined), [key, ownerId]);
  const update = useCallback((updater: (current: T | undefined) => T | undefined) => {
    if (!ownerId) return;
    const current = memory.get(recordId(ownerId, key)) as QuerySnapshot<T> | undefined;
    const data = updater(current?.data);
    if (data === undefined) return;
    const shared = shareUnchanged(current?.data, data) as T;
    publish(recordId(ownerId, key), { data: shared, loading: false, refreshing: false, updatedAt: new Date().toISOString() });
    void writeRecord(ownerId, key, shared);
  }, [key, ownerId]);

  return { data: snapshot.data, loading: snapshot.loading, refreshing: snapshot.refreshing, error: snapshot.error, refresh: refreshNow, update };
}

export async function prefetchBrowserPageQuery<T>(ownerId: string, key: string, load: () => Promise<T>) {
  const id = recordId(ownerId, key);
  if (memory.get(id)?.data !== undefined) return memory.get(id)?.data as T;
  await hydrate<T>(ownerId, key);
  if (memory.get(id)?.data !== undefined) return memory.get(id)?.data as T;
  return refresh(ownerId, key, load);
}

export function refreshBrowserPageQuery<T>(ownerId: string, key: string, load: () => Promise<T>) {
  return refresh(ownerId, key, load);
}

export function refreshBrowserPageQueries(ownerId: string) {
  const prefix = `${ownerId}:`;
  return Promise.all([...refetchers.entries()].filter(([id]) => id.startsWith(prefix)).map(([, refetch]) => refetch()));
}

export function getBrowserPageCache<T>(ownerId: string | undefined, key: string): T | undefined {
  if (!ownerId) return undefined;
  return memory.get(recordId(ownerId, key))?.data as T | undefined;
}

export async function readBrowserPageCache<T>(ownerId: string, key: string): Promise<T | undefined> {
  await hydrate<T>(ownerId, key);
  return memory.get(recordId(ownerId, key))?.data as T | undefined;
}

export async function writeBrowserPageCache<T>(ownerId: string, key: string, data: T) {
  const id = recordId(ownerId, key);
  const current = memory.get(id) as QuerySnapshot<T> | undefined;
  const shared = shareUnchanged(current?.data, data) as T;
  publish(id, { data: shared, loading: false, refreshing: false, updatedAt: new Date().toISOString() });
  await writeRecord(ownerId, key, shared);
}

export function prefetchPageApis(ownerId: string, page: string) {
  const personalListId = typeof window !== "undefined" ? localStorage.getItem("project_echo_personal_list_id") || "" : "";
  const taskListId = typeof window !== "undefined" ? localStorage.getItem("project_echo_clickup_list_id") || "" : "";
  const meetingsUrl = `/api/meetings?all=true${personalListId ? `&personalListId=${encodeURIComponent(personalListId)}` : ""}`;
  const tasksUrl = `/api/tasks${taskListId ? `?listId=${encodeURIComponent(taskListId)}` : ""}`;
  const apis: Record<string, Array<{ key: string; url: string; select: (data: Record<string, unknown>) => unknown }>> = {
    dashboard: [{ key: "meetings:all", url: meetingsUrl, select: (data) => ({ meetings: data.meetings || [] }) }],
    meetings: [{ key: "meetings:all", url: meetingsUrl, select: (data) => ({ meetings: data.meetings || [] }) }],
    minutes: [{ key: "meetings:all", url: meetingsUrl, select: (data) => ({ meetings: data.meetings || [] }) }],
    project: [
      { key: "projects:gallery", url: "/api/tasks?action=project-gallery", select: (data) => ({ projects: data.projects || [] }) },
      { key: "projects:selection", url: "/api/projects/selection", select: (data) => ({ folderIds: data.folderIds || [] }) },
    ],
    tasks: [{ key: `tasks:${taskListId || "default"}`, url: tasksUrl, select: (data) => data }],
    notebook: [{ key: "notebook:current", url: "/api/notebook", select: (data) => data }],
    demands: [{ key: "demands:all", url: "/api/demands", select: (data) => ({ demands: data.demands || [] }) }],
    "market-insights": [{ key: "market-insights:all", url: "/api/market-insights", select: (data) => ({ articles: data.articles || [] }) }],
  };
  for (const { key, url, select } of apis[page] || []) {
    void prefetchBrowserPageQuery(ownerId, key, async () => {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) throw Object.assign(new Error(String(data.error || "Unable to preload this page.")), { status: response.status });
      return select(data);
    });
  }
}

export async function clearBrowserPageCache(ownerId: string) {
  for (const id of [...memory.keys()]) if (id.startsWith(`${ownerId}:`)) { memory.delete(id); notify(id); }
  const db = await openDatabase();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.index("ownerId").openKeyCursor(IDBKeyRange.only(ownerId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      store.delete(cursor.primaryKey);
      cursor.continue();
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
    transaction.onabort = () => resolve();
  });
}
