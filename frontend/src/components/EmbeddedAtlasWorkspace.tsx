"use client";

import WorkspacePage from "../../../project-atlas/frontend/atlas-app/src/app/page";
import type { AtlasWorkspaceType } from "../../../project-atlas/frontend/atlas-app/src/store/useProjectStore";

export default function EmbeddedAtlasWorkspace({
  workspaceType,
  mosaicProjectId,
}: {
  workspaceType: Exclude<AtlasWorkspaceType, "standalone">;
  mosaicProjectId?: string;
}) {
  return <WorkspacePage workspaceType={workspaceType} mosaicProjectId={mosaicProjectId} />;
}
