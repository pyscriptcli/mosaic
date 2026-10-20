import type { DeltaSection } from "./compare";

export const MAX_TEXT_CHARACTERS = 500_000;
export const MAX_TEXT_FILE_BYTES = 20 * 1024 * 1024;

export function readTextSections(value: string): DeltaSection[] {
  const normalized = value.replace(/\r\n?/gu, "\n");
  if (!normalized.trim()) throw new Error("The text input is empty. Add text or choose another file.");
  if (normalized.length > MAX_TEXT_CHARACTERS) throw new Error("Text documents are limited to 500,000 characters.");
  const paragraphs = normalized.split(/\n\s*\n/gu).filter((text) => text.trim());
  return paragraphs.map((text, index) => ({ number: String(index + 1), heading: `Paragraph ${index + 1}`, text, comments: [] }));
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
