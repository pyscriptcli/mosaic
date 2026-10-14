export interface ClickUpSyncItem {
  id?: string;
  label?: string;
}

export interface ClickUpSyncResponse {
  runId: string;
  accepted: number;
  requested: number;
  items: ClickUpSyncItem[];
  state: "syncing";
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

export async function requestCentralClickUpSync(listIds: string[] = [], listLabels: Record<string, string> = {}) {
  const storedIds = typeof window === "undefined" ? [] : [
    storedListId("project_echo_clickup_list_id"),
    storedListId("project_echo_personal_list_id"),
    ...storedProjectListIds(),
  ].filter(Boolean);
  const response = await fetch("/api/integrations/clickup/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ listIds: [...new Set([...storedIds, ...listIds])], listLabels }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "ClickUp sync could not be started.");
  if (typeof window !== "undefined") {
    try {
      const prior: unknown = JSON.parse(localStorage.getItem("project_echo_clickup_sync_labels") || "{}");
      const labels = prior && typeof prior === "object" ? { ...(prior as Record<string, string>) } : {};
      for (const item of (data as ClickUpSyncResponse).items || []) {
        if (item.id && item.label) labels[item.id] = item.label;
      }
      localStorage.setItem("project_echo_clickup_sync_labels", JSON.stringify(Object.fromEntries(Object.entries(labels).slice(-100))));
    } catch { /* Telemetry falls back to the ClickUp list ID. */ }
    window.dispatchEvent(new CustomEvent("mosaic-clickup-sync-requested", { detail: { runId: (data as ClickUpSyncResponse).runId } }));
  }
  return data as ClickUpSyncResponse;
}
