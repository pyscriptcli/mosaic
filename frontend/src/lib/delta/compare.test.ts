import { describe, expect, it } from "vitest";
import { compareSections, type DeltaSection } from "./compare";

const section = (text: string): DeltaSection => ({ number: "1", heading: "Payment", text, comments: [] });

describe("compareSections", () => {
  it("reports punctuation and case edits instead of hiding them", () => {
    expect(compareSections([section("Payment is due in 30 days.")], [section("payment is due in 30 days!")])).toEqual([
      expect.objectContaining({ summary: "Wording revised", originalText: "Payment\n\nPayment is due in 30 days.", revisedText: "Payment\n\npayment is due in 30 days!" }),
    ]);
  });

  it("keeps comments as review entries when wording is unchanged", () => {
    expect(compareSections(
      [{ ...section("Payment is due."), comments: [{ author: "Legal", text: "Confirm due date." }] }],
      [section("Payment is due.")],
    )).toHaveLength(1);
  });
});
