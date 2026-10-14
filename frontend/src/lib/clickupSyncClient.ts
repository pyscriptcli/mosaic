export interface ClickUpSyncItem {
  id?: string;
  label?: string;
}

export interface ClickUpSyncResponse {
  runId?: string;
  accepted: number;
  requested: number;
  items: ClickUpSyncItem[];
  state: "syncing" | "synced";
  source?: "clickup-live";
  refreshed?: string[];
}

export function trackClickUpLiveRefresh(event: Event, refresh: () => Promise<unknown>, label?: string) {
  const work = Promise.resolve().then(refresh);
  const detail = (event as CustomEvent<{ refreshes?: Promise<unknown>[]; targets?: string[]; targetRefreshes?: Array<{ label: string; promise: Promise<unknown> }> }>).detail;
  if (Array.isArray(detail?.refreshes)) detail.refreshes.push(work);
  if (label) {
    if (Array.isArray(detail?.targets) && !detail.targets.includes(label)) detail.targets.push(label);
    detail?.targetRefreshes?.push({ label, promise: work });
  }
  return work;
}

function storedProjectListIds() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem("project_echo_project_list_ids") || "[]");
    return Array.isArray(value) ? value.map(String).filter((id) => /^\d{4,24}$/.test(id)).slice(0, 50) : [];
  } catch {
    return [];
  }
}

function storedListId(key: string) {
  try { return localStorage.getItem(key) || ""; }
  catch { return ""; }
}

let activeCentralSync: Promise<ClickUpSyncResponse> | null = null;

export function requestCentralClickUpSync(listIds: string[] = [], listLabels: Record<string, string> = {}) {
  if (activeCentralSync) return activeCentralSync;
  const request = performCentralClickUpSync(listIds, listLabels);
  activeCentralSync = request.finally(() => { activeCentralSync = null; });
  return activeCentralSync;
}

async function performCentralClickUpSync(listIds: string[], listLabels: Record<string, string>) {
  const storedIds = typeof window === "undefined" ? [] : [
    storedListId("project_echo_clickup_list_id"),
    storedListId("project_echo_personal_list_id"),
    ...storedProjectListIds(),
  ].filter(Boolean);
  let response: Response;
  try {
    response = await fetch("/api/integrations/clickup/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listIds: [...new Set([...storedIds, ...listIds])], listLabels }),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ClickUp sync could not be started.";
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("mosaic-clickup-live-refresh-complete", { detail: { state: "error", error: message, targets: [], failedTargets: [] } }));
    throw error;
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "ClickUp sync could not be started.");
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("mosaic-clickup-live-refresh-complete", { detail: { state: "error", error: error.message, targets: [], failedTargets: [] } }));
    throw error;
  }
  if (typeof window !== "undefined") {
    const responseData = data as ClickUpSyncResponse;
    window.dispatchEvent(new CustomEvent("mosaic-clickup-sync-requested", { detail: { runId: responseData.runId, live: true } }));
    const refreshes: Promise<unknown>[] = [];
    const targets: string[] = [];
    const targetRefreshes: Array<{ label: string; promise: Promise<unknown> }> = [];
    window.dispatchEvent(new CustomEvent("mosaic-clickup-sync-complete", { detail: { refreshes, targets, targetRefreshes } }));
    window.dispatchEvent(new CustomEvent("mosaic-clickup-live-refresh-started", { detail: { targets } }));
    const results = await Promise.allSettled(refreshes);
    const failedTargets = [...new Set(targetRefreshes.flatMap(({ label, promise }) => {
      const index = refreshes.indexOf(promise);
      return index >= 0 && results[index].status === "rejected" ? [label] : [];
    }))];
    if (failedTargets.length) {
      const firstFailure = results.find((result) => result.status === "rejected");
      const reason = firstFailure?.status === "rejected" ? firstFailure.reason : null;
      const message = reason instanceof Error ? reason.message : "One or more ClickUp views could not be refreshed.";
      window.dispatchEvent(new CustomEvent("mosaic-clickup-live-refresh-complete", { detail: { state: "error", count: refreshes.length, targets, failedTargets, error: message } }));
      throw Object.assign(new Error(message), { failedTargets });
    }
    {
      window.dispatchEvent(new CustomEvent("mosaic-clickup-live-refresh-complete", { detail: { state: "synced", count: refreshes.length, targets } }));
      return { ...responseData, refreshed: targets };
    }
  }
  return data as ClickUpSyncResponse;
}
