import type { DeltaSection } from "./compare";

export const MAX_TEXT_CHARACTERS = 500_000;
export const MAX_TEXT_FILE_BYTES = 20 * 1024 * 1024;

function sectionHeading(value: string) {
  const firstLine = value.split("\n", 1)[0].trim();
  const markdownHeading = firstLine.match(/^#{1,6}\s+(.+?)\s*#*$/u);
  const text = (markdownHeading?.[1] || firstLine).trim();
  const legalHeading = text.match(/^(Article|Section|Clause|Schedule|Annex|Appendix)\s+([ivxlcdm]+|\d+(?:\.\d+)*[a-z]?)(?:[.)]?)(?:\s+(.+))?$/iu);
  if (legalHeading) {
    const title = (legalHeading[3] || "").split(/(?<=[.!?])\s+/u)[0]?.replace(/[.!?]+$/u, "").trim();
    return `${legalHeading[1]} ${legalHeading[2]}${title ? `. ${title}` : ""}`;
  }
  return markdownHeading ? text : null;
}

export function readTextSections(value: string): DeltaSection[] {
  const normalized = value.replace(/\r\n?/gu, "\n");
  if (!normalized.trim()) throw new Error("The text input is empty. Add text or choose another file.");
  if (normalized.length > MAX_TEXT_CHARACTERS) throw new Error("Text documents are limited to 500,000 characters.");
  const paragraphs = normalized.split(/\n\s*\n/gu).filter((text) => text.trim());
  let currentHeading = "";
  return paragraphs.map((text, index) => {
    currentHeading = sectionHeading(text) || currentHeading;
    return { number: String(index + 1), heading: currentHeading || `Paragraph ${index + 1}`, text, comments: [] };
  });
}

export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_TEXT_FILE_BYTES) throw new Error(`${file.name} exceeds the 20 MiB file limit.`);
  let value: string;
  try {
    value = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    throw new Error(`${file.name} is not valid UTF-8 text. Save it as UTF-8 or paste the text instead.`);
  }
  readTextSections(value);
  return value;
}
