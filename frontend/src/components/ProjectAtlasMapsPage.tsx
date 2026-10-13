"use client";

import { useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getProjectAtlasAppUrl } from "@/lib/projectAtlasUrls";

export default function ProjectAtlasMapsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const atlasUrl = getProjectAtlasAppUrl();

  return (
    <section aria-label="Project Atlas Maps" className="relative flex h-full min-h-0 w-full flex-col bg-[#0a0d12] text-[#003366]">
      <div className="absolute left-4 top-4 z-20 flex items-center gap-2">
        <a href="/dashboard" className="inline-flex h-9 w-9 items-center justify-center border border-white/20 bg-[#101820]/85 text-white shadow-sm transition-colors hover:bg-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]" aria-label="Back to Mosaic" title="Back to Mosaic">
          <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        </a>
        <a href={atlasUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 w-9 items-center justify-center border border-white/20 bg-[#101820]/85 text-white shadow-sm transition-colors hover:bg-[#003366] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9A84C]" aria-label="Open Project Atlas in a new tab" title="Open in new tab">
          <ExternalLink aria-hidden="true" className="h-4 w-4" />
        </a>
      </div>
      <div className="relative min-h-0 flex-1">
        {isLoading && <div role="status" className="absolute inset-0 z-10 flex items-center justify-center bg-[#FFFCFB] text-xs text-[#003366]">Opening Project Atlas…</div>}
        <iframe title="Project Atlas map workspace" src={atlasUrl} onLoad={() => setIsLoading(false)} className="h-full w-full border-0 bg-[#0a0d12]" allow="fullscreen" allowFullScreen referrerPolicy="strict-origin" />
      </div>
    </section>
  );
}
