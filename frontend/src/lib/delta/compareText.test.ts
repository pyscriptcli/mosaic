import { describe, expect, it } from "vitest";
import { compareTextDocuments } from "./compareText";

describe("compareTextDocuments", () => {
  it("locates an inserted paragraph without marking following paragraphs changed", () => {
    expect(compareTextDocuments("First clause.\n\nFinal clause.", "First clause.\n\nNew middle clause.\n\nFinal clause.")).toEqual([
      expect.objectContaining({ summary: "Text added", originalText: "", revisedText: "New middle clause." }),
    ]);
  });

  it("reports punctuation, case, and number changes", () => {
    expect(compareTextDocuments("Payment is due in 30 days.", "payment is due in 31 days!")).toEqual([
      expect.objectContaining({ summary: "Wording revised", originalText: "Payment is due in 30 days.", revisedText: "payment is due in 31 days!" }),
    ]);
  });

  it("returns no entries for identical documents", () => {
    expect(compareTextDocuments("Clause one.\n\nClause two.", "Clause one.\n\nClause two.")).toEqual([]);
  });
});
