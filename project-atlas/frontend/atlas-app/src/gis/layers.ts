import { GISFeature, CustomGroups } from '../types/gis';

export function reorderFeatures(
  features: GISFeature[],
  draggedId: number,
  targetId: number
): GISFeature[] {
  const next = [...features];
  const draggedIndex = next.findIndex((f) => f.id === draggedId);
  const targetIndex = next.findIndex((f) => f.id === targetId);
  if (draggedIndex === -1 || targetIndex === -1) return features;

  const [draggedItem] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, draggedItem);
  return next;
}

export function moveFeatureToGroup(
  customGroups: CustomGroups,
  featureId: number,
  targetGroupName: string | null
): CustomGroups {
  const nextGroups: CustomGroups = {};

  // Clean out featureId from all groups first
  for (const gName in customGroups) {
    nextGroups[gName] = {
      ...customGroups[gName],
      ids: customGroups[gName].ids.filter((id) => id !== featureId),
    };
  }

  // If adding to a specific group
  if (targetGroupName && nextGroups[targetGroupName]) {
    if (!nextGroups[targetGroupName].ids.includes(featureId)) {
      nextGroups[targetGroupName].ids.push(featureId);
    }
  }

  return nextGroups;
}

export function bulkStyleGroupMarkers(
  features: GISFeature[],
  groupMemberIds: number[],
  color: string,
  shape?: string,
  size?: number
): GISFeature[] {
  return features.map((f) => {
    if (groupMemberIds.includes(f.id) && f.kind === 'marker') {
      const nextProps = { ...f.props, color, borderColor: color };
      if (shape) nextProps.shape = shape as any;
      if (size !== undefined) nextProps.iconSize = size;
      return {
        ...f,
        props: nextProps,
      };
    }
    return f;
  });
}
