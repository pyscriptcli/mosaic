"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FloatingRecordingPill } from "@/components/FloatingRecordingPill";
import { navRouteForView, navViewForPath } from "@/lib/navRoutes";
import { useStudioRecorder, type UseStudioRecorderReturn } from "@/hooks/useStudioRecorder";

const StudioRecorderContext = createContext<UseStudioRecorderReturn | null>(null);

export function useStudioRecorderContext(): UseStudioRecorderReturn {
  const recorder = useContext(StudioRecorderContext);
  if (!recorder) {
    throw new Error("useStudioRecorderContext must be used within StudioRecorderProvider");
  }
  return recorder;
}

export function StudioRecorderProvider({ children }: { children: ReactNode }) {
  const recorder = useStudioRecorder();
  const pathname = usePathname();
  const router = useRouter();
  const isNotetakerPage = navViewForPath(pathname || "") === "minutes";

  return (
    <StudioRecorderContext.Provider value={recorder}>
      {children}
      {!isNotetakerPage && (
        <FloatingRecordingPill
          recorder={recorder}
          onExpand={() => router.push(navRouteForView("minutes") || "/meetings/notetaker")}
        />
      )}
    </StudioRecorderContext.Provider>
  );
}
