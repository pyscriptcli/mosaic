"use client";

import dynamic from "next/dynamic";
import { ArrowLeft, ExternalLink } from "lucide-react";

const EmbeddedAtlasWorkspace = dynamic(() => import("@/components/EmbeddedAtlasWorkspace"), {
  ssr: false,
  loading: () => <div role="status" className="flex h-full min-h-0 items-center justify-center bg-[#0a1628] text-sm text-slate-200">Loading map workspace…</div>,
});

export default function ProjectAtlasMapsPage() {
  return (
    <section aria-label="Project Atlas Maps" className="relative h-full min-h-0 w-full overflow-hidden bg-[#0a1628]">
      <div className="absolute left-4 top-4 z-50 flex items-center gap-2">
        <a href="/dashboard" className="inline-flex h-9 w-9 items-center justify-center border border-white/20 bg-[#101820]/85 text-white shadow-sm transition-colors hover:bg-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]" aria-label="Back to Mosaic" title="Back to Mosaic">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        </a>
        <a href="/maps/project-atlas" target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-9 items-center justify-center border border-white/20 bg-[#101820]/85 text-white shadow-sm transition-colors hover:bg-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]" aria-label="Open maps in a new tab" title="Open in new tab">
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      </div>
      <EmbeddedAtlasWorkspace workspaceType="mosaic" />
    </section>
  );
}
