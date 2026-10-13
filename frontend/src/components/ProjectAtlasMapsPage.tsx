"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Maximize2, Minimize2 } from "lucide-react";
import { getProjectAtlasAppUrl } from "@/lib/projectAtlasUrls";

export default function ProjectAtlasMapsPage() {
  const workspaceRef = useRef<HTMLElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const atlasUrl = getProjectAtlasAppUrl();

  useEffect(() => {
    const updateFullscreen = () => setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener("fullscreenchange", updateFullscreen);
    return () => document.removeEventListener("fullscreenchange", updateFullscreen);
  }, []);

  const toggleFullscreen = async () => {
    const workspace = workspaceRef.current;
    if (!workspace) return;

    try {
      if (document.fullscreenElement === workspace) await document.exitFullscreen();
      else await workspace.requestFullscreen();
    } catch {
      // Fullscreen can be denied by browser settings; the embedded map remains usable.
    }
  };

  return (
    <section ref={workspaceRef} aria-label="Project Atlas Maps" className="flex h-full min-h-0 w-full flex-col bg-[#FFFCFB] text-[#003366]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-[#FFFCFB] px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Maps</p>
          <p className="truncate text-[11px] text-slate-600">Project Atlas workspace</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a href={atlasUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1.5 border border-slate-300 px-2.5 text-[11px] font-semibold text-[#003366] hover:bg-[#F7FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9AB4C]" aria-label="Open Project Atlas in a new tab">
            <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Open in new tab</span>
          </a>
          <button type="button" onClick={() => void toggleFullscreen()} className="inline-flex h-8 items-center gap-1.5 border border-slate-300 px-2.5 text-[11px] font-semibold text-[#003366] hover:bg-[#F7FAFC] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#C9AB4C]" aria-label={isFullscreen ? "Exit full screen" : "Fill screen"} title={isFullscreen ? "Exit full screen" : "Fill screen"}>
            {isFullscreen ? <Minimize2 aria-hidden="true" className="h-3.5 w-3.5" /> : <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">{isFullscreen ? "Exit full screen" : "Fill screen"}</span>
          </button>
        </div>
      </header>
      <div className="relative min-h-0 flex-1">
        {isLoading && <div role="status" className="absolute inset-0 z-10 flex items-center justify-center bg-[#FFFCFB] text-xs text-[#003366]">Opening Project Atlas…</div>}
        <iframe title="Project Atlas map workspace" src={atlasUrl} onLoad={() => setIsLoading(false)} className="h-full w-full border-0 bg-[#0a0d12]" allow="fullscreen" allowFullScreen referrerPolicy="strict-origin" />
      </div>
    </section>
  );
}
