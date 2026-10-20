import { describe, expect, it } from "vitest";
import { filterBlankOnlyChanges, isBlankOnlyChange } from "./changeFilter";

describe("blank-only comparison filter", () => {
  it("hides only changes made of whitespace and underscores", () => {
    expect(isBlankOnlyChange({ originalText: "___  \n", revisedText: "  ____" })).toBe(true);
    expect(isBlankOnlyChange({ originalText: "", revisedText: "__\u00a0_" })).toBe(true);
  });

  it("keeps punctuation-only and mixed wording changes", () => {
    expect(isBlankOnlyChange({ originalText: ";", revisedText: "," })).toBe(false);
    expect(isBlankOnlyChange({ originalText: "___ Payment", revisedText: "Payment" })).toBe(false);
  });

  it("returns a filtered view without mutating source entries", () => {
    const entries = [
      { id: "blank", originalText: "___", revisedText: "" },
      { id: "wording", originalText: "Payment", revisedText: "Due" },
    ];

    expect(filterBlankOnlyChanges(entries, "meaningful").map(({ id }) => id)).toEqual(["wording"]);
    expect(filterBlankOnlyChanges(entries, "all")).toBe(entries);
    expect(entries).toHaveLength(2);
  });
});
