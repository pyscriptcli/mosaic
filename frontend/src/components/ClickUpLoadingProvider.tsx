"use client";

import { useLayoutEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";

const CLICKUP_API_PATH = /^\/api\/(?:tasks|my-day|notebook|meetings|demands|market-insights|ask-echo|forms|rfp|save-meeting|meeting|projects\/(?:activity|assignees|sites)|integrations\/clickup|auth\/me)(?:\/|$)/;

function isWorkspaceRead(input: RequestInfo | URL, init?: RequestInit): boolean {
  const source = input instanceof Request ? input.url : String(input);
  let url: URL;
  try { url = new URL(source, window.location.origin); } catch { return false; }
  if (url.origin !== window.location.origin || !CLICKUP_API_PATH.test(url.pathname)) return false;
  const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
  return method === "GET" || method === "HEAD";
}

export function ClickUpLoadingPanel({ label = "Loading workspace" }: { label?: string }) {
  return <section role="status" aria-live="polite" aria-busy="true" className="w-full border border-slate-200 bg-[#FFFCFB] p-4 text-[#003366]">
    <div className="flex items-center gap-2 text-xs font-medium"><LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />{label}</div>
    <div aria-hidden="true" className="mt-4 space-y-2">
      <div className="h-10 motion-safe:animate-pulse border border-slate-100 bg-slate-50" />
      <div className="h-10 motion-safe:animate-pulse border border-slate-100 bg-slate-50" />
      <div className="h-10 motion-safe:animate-pulse border border-slate-100 bg-slate-50" />
    </div>
  </section>;
}

export function ClickUpLoadingProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);

  useLayoutEffect(() => {
    const originalFetch = window.fetch;
    const pending = new Set<number>();
    let requestId = 0;
    let showTimer: number | undefined;
    let hideTimer: number | undefined;
    let visible = false;

    const publish = () => {
      if (pending.size === 0) {
        window.clearTimeout(showTimer);
        showTimer = undefined;
        window.clearTimeout(hideTimer);
        if (visible) hideTimer = window.setTimeout(() => { visible = false; setLoading(false); }, 160);
        return;
      }
      window.clearTimeout(hideTimer);
      if (!visible && showTimer === undefined) {
        showTimer = window.setTimeout(() => { visible = true; showTimer = undefined; setLoading(true); }, 220);
      }
    };

    const trackedFetch: typeof window.fetch = async (input, init) => {
      if (!isWorkspaceRead(input, init)) return originalFetch.call(window, input, init);
      const id = ++requestId;
      pending.add(id);
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
    {loading && <div role="status" aria-label="Loading workspace data" aria-live="polite" aria-busy="true" className="pointer-events-none fixed left-[56px] right-0 top-[58px] z-[100] h-0.5 bg-[#003366]/10">
      <span aria-hidden="true" className="block h-full w-full bg-[#C9A84C]" />
    </div>}
  </>;
}
