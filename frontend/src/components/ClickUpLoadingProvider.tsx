"use client";

import { useLayoutEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

type Activity = "loading" | "saving";

const CLICKUP_API_PATH = /^\/api\/(?:tasks|my-day|notebook|meetings|demands|market-insights|ask-echo|forms|rfp|save-meeting|meeting|projects\/(?:activity|assignees|sites)|integrations\/clickup|auth\/me)(?:\/|$)/;

function clickUpActivity(input: RequestInfo | URL, init?: RequestInit): Activity | null {
  const source = input instanceof Request ? input.url : String(input);
  let url: URL;
  try { url = new URL(source, window.location.origin); } catch { return null; }
  if (url.origin !== window.location.origin || !CLICKUP_API_PATH.test(url.pathname)) return null;
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  return method === "GET" || method === "HEAD" ? "loading" : "saving";
}

export function ClickUpLoadingPanel({ label = "Loading from ClickUp", compact = false }: { label?: string; compact?: boolean }) {
  return <div role="status" aria-live="polite" aria-busy="true" className={"flex items-center gap-3 border border-slate-200 border-t-2 border-t-[#C9A84C] bg-[#FFFCFB] text-[#003366] " + (compact ? "px-3 py-2 text-xs shadow-sm" : "mx-auto my-10 max-w-xl px-5 py-7 text-sm")}>
    <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin text-[#003366]" />
    <div className="min-w-0"><p className="font-semibold">{label}</p>{!compact && <p className="mt-1 text-xs text-slate-600">Mosaic is loading your workspace data.</p>}</div>
  </div>;
}

export function ClickUpLoadingProvider({ children }: { children: React.ReactNode }) {
  const [activity, setActivity] = useState<Activity | null>(null);

  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    const pending = new Map<number, Activity>();
    let requestId = 0;
    let showTimer: number | undefined;
    let hideTimer: number | undefined;

    const publish = () => {
      if (pending.size === 0) {
        window.clearTimeout(showTimer);
        showTimer = undefined;
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(() => setActivity(null), 120);
        return;
      }
      window.clearTimeout(hideTimer);
      const next = Array.from(pending.values()).includes("saving") ? "saving" : "loading";
      window.clearTimeout(showTimer);
      showTimer = window.setTimeout(() => setActivity(next), 180);
    };

    const trackedFetch: typeof window.fetch = async (input, init) => {
      const kind = clickUpActivity(input, init);
      if (!kind) return originalFetch.call(window, input, init);
      const id = ++requestId;
      pending.set(id, kind);
      publish();
      try {
        return await originalFetch.call(window, input, init);
      } finally {
        pending.delete(id);
        publish();
      }
    };

    window.fetch = trackedFetch;
    return () => {
      if (window.fetch === trackedFetch) window.fetch = originalFetch;
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, []);

  return <>
    {children}
    {activity && <div className="pointer-events-none fixed inset-x-0 top-2 z-[100] flex justify-center px-3">
      <div className="pointer-events-auto"><ClickUpLoadingPanel compact label={activity === "saving" ? "Saving changes to ClickUp" : "Loading data from ClickUp"} /></div>
    </div>}
  </>;
}
