import { GISFeature } from '../types/gis';
import { calcBounds } from './polygons';

export function computeLabelFeature(f: GISFeature): any | null {
  if (!f.props.showLabel || f.props.visible === 0) return null;

  let labelText = f.name;
  if (f.kind !== 'route' && f.props.attributes && f.props.attributes.label_text) {
    labelText = f.props.attributes.label_text;
  }
  if (!labelText) return null;

  const pos = f.props.labelPos || 'center';
  let coords: [number, number] | null = null;

  if (f.geometry.type === 'Point') {
    const x = f.geometry.coordinates[0];
    const y = f.geometry.coordinates[1];
    const d = 0.0009;
    if (pos === 'top') coords = [x, y + d];
    else if (pos === 'bottom') coords = [x, y - d];
    else if (pos === 'left') coords = [x - d, y];
    else if (pos === 'right') coords = [x + d, y];
    else coords = [x, y];
  } else {
    const b = calcBounds(f);
    if (!b) return null;
    const cx = (b[0][0] + b[1][0]) / 2;
    const cy = (b[0][1] + b[1][1]) / 2;
    if (pos === 'top') coords = [cx, b[1][1]];
    else if (pos === 'bottom') coords = [cx, b[0][1]];
    else if (pos === 'left') coords = [b[0][0], cy];
    else if (pos === 'right') coords = [b[1][0], cy];
    else coords = [cx, cy];
  }

  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: coords },
    properties: { labelText },
  };
}

export function generateLabelsGeoJSON(features: GISFeature[]) {
  const feats: any[] = [];
  features.forEach((f) => {
    const lf = computeLabelFeature(f);
    if (lf) feats.push(lf);
  });
  return {
    type: 'FeatureCollection',
    features: feats,
  };
}
