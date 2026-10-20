export type ChangeFilter = "all" | "meaningful";

export type ChangeWording = { originalText: string; revisedText: string };

export function isBlankOnlyChange(change: ChangeWording) {
  const changedText = `${change.originalText}${change.revisedText}`;
  return changedText.length > 0 && !/[^\s_]/u.test(changedText);
}

export function filterBlankOnlyChanges<T extends ChangeWording>(changes: T[], filter: ChangeFilter): T[] {
  return filter === "all" ? changes : changes.filter((change) => !isBlankOnlyChange(change));
}
