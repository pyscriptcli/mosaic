import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";

const DOWNLOAD_TTL_MS = 30 * 60 * 1000;
const exportsById = new Map<string, { pptxPath: string; pdfPath: string | null; expiresAt: number }>();

export function registerPropertyDeckExport(pptxPath: string, pdfPath: string | null): string {
  const now = Date.now();
  for (const [id, item] of exportsById) {
    if (item.expiresAt <= now) exportsById.delete(id);
  }
  const id = randomUUID();
  exportsById.set(id, { pptxPath, pdfPath, expiresAt: now + DOWNLOAD_TTL_MS });
  return id;
}

export function setPropertyDeckPdf(id: string, pdfPath: string | null): boolean {
  const item = exportsById.get(id);
  if (!item || item.expiresAt <= Date.now()) return false;
  item.pdfPath = pdfPath;
  return true;
}

export function getPropertyDeckPptxPath(id: string): string | null {
  const item = exportsById.get(id);
  return item && item.expiresAt > Date.now() ? item.pptxPath : null;
}

export async function readPropertyDeckExport(id: string, format: "pptx" | "pdf") {
  const item = exportsById.get(id);
  if (!item || item.expiresAt <= Date.now()) {
    exportsById.delete(id);
    return null;
  }
  const filePath = format === "pptx" ? item.pptxPath : item.pdfPath;
  if (!filePath) return null;
  try {
    const content = await fs.readFile(filePath);
    return {
      content,
      fileName: filePath.split(/[\\/]/).pop() || `proposal.${format}`,
    };
  } catch {
    return null;
  }
}
