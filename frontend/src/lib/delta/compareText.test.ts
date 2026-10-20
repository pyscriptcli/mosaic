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

  it("labels paragraph changes with the nearest explicit legal section heading", () => {
    expect(compareTextDocuments(
      "Section 2.3. Pre-Termination\n\nThe lease may end after thirty days.",
      "Section 2.3. Pre-Termination\n\nThe lease may end after forty days.",
    )).toEqual([
      expect.objectContaining({
        section: "Section 2.3. Pre-Termination",
        originalSection: "Section 2.3. Pre-Termination",
        revisedSection: "Section 2.3. Pre-Termination",
        originalText: "The lease may end after thirty days.",
        revisedText: "The lease may end after forty days.",
      }),
    ]);
  });

  it("returns no entries for identical documents", () => {
    expect(compareTextDocuments("Clause one.\n\nClause two.", "Clause one.\n\nClause two.")).toEqual([]);
  });
});
