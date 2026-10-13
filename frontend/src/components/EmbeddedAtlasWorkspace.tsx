"use client";

import WorkspacePage from "../../../project-atlas/frontend/atlas-app/src/WorkspacePage";
import type { AtlasWorkspaceType } from "../../../project-atlas/frontend/atlas-app/src/store/useProjectStore";

export default function EmbeddedAtlasWorkspace({
  workspaceType,
  mosaicProjectId,
  workspaceName,
}: {
  workspaceType: Exclude<AtlasWorkspaceType, "standalone">;
  mosaicProjectId?: string;
  workspaceName?: string;
}) {
  return <WorkspacePage workspaceType={workspaceType} mosaicProjectId={mosaicProjectId} workspaceName={workspaceName} />;
}
