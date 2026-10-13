import { GISFeature } from '../types/gis';

export function initializeFeatureAttributes(f: GISFeature): GISFeature {
  const next = { ...f, props: { ...f.props } };

  if (!next.props.attributes) {
    next.props.attributes = {
      name: next.name || '',
      description: next.props.description || '',
    };
  }

  if (!next.props.attrTypes) {
    next.props.attrTypes = { name: 'text', description: 'text' };
  }

  if (!next.props.attrRows || !next.props.attrRows.length) {
    next.props.attrRows = [{ ...next.props.attributes }];
  }

  return next;
}

export function updateAttributeCell(
  f: GISFeature,
  rIdx: number,
  key: string,
  val: string
): GISFeature {
  const next = initializeFeatureAttributes(f);
  const rows = [...(next.props.attrRows || [])];
  if (!rows[rIdx]) rows[rIdx] = {};
  rows[rIdx] = { ...rows[rIdx], [key]: val };

  next.props.attrRows = rows;

  if (rIdx === 0) {
    next.props.attributes = { ...(next.props.attributes || {}), [key]: val };
    if (key === 'name') {
      next.name = val;
    }
    if (key === 'description') {
      next.props.description = val;
    }
  }

  return next;
}

export function addAttributeColumn(
  f: GISFeature,
  colName: string,
  colType: 'text' | 'image'
): GISFeature {
  const next = initializeFeatureAttributes(f);
  const types = { ...(next.props.attrTypes || {}), [colName]: colType };
  const rows = (next.props.attrRows || []).map((r) => ({ ...r, [colName]: '' }));

  next.props.attrTypes = types;
  next.props.attrRows = rows;
  if (next.props.attributes) {
    next.props.attributes[colName] = '';
  }

  return next;
}

export function addAttributeRow(f: GISFeature): GISFeature {
  const next = initializeFeatureAttributes(f);
  const newRow: Record<string, string> = {};
  Object.keys(next.props.attrTypes || {}).forEach((k) => (newRow[k] = ''));

  next.props.attrRows = [...(next.props.attrRows || []), newRow];
  return next;
}

export function removeAttributeRow(f: GISFeature, rIdx: number): GISFeature {
  const next = initializeFeatureAttributes(f);
  const rows = [...(next.props.attrRows || [])];
  if (rows.length <= 1) return f; // Keep at least one primary row

  rows.splice(rIdx, 1);
  next.props.attrRows = rows;
  return next;
}
