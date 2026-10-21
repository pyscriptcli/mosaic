export function extractClickUpListId(input: string): string {
  const trimmed = input.trim();
  if (trimmed.startsWith("http")) {
    const liMatch = trimmed.match(/\/li\/([a-zA-Z0-9_-]+)/i);
    if (liMatch) return liMatch[1];
    const listMatch = trimmed.match(/\/lists?\/([a-zA-Z0-9_-]+)/i);
    if (listMatch) return listMatch[1];
    const lastSegment = trimmed.split("?")[0].split("/").filter(Boolean).pop();
    if (lastSegment && /^[a-zA-Z0-9_-]+$/.test(lastSegment)) return lastSegment;
  }
  return trimmed.replace(/[^a-zA-Z0-9_-]/g, "");
}
