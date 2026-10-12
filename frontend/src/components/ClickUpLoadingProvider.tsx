"use client";

import { LoaderCircle } from "lucide-react";

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
  return <>{children}</>;
}
