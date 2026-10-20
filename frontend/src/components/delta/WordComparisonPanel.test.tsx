// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { WordComparisonPanel } from "./WordComparisonPanel";
import type { DeltaEntry } from "@/lib/delta/compare";

afterEach(cleanup);

const entries: DeltaEntry[] = [{
  id: "delta-0-0",
  section: "1 Payment",
  originalSection: "1 Payment",
  revisedSection: "1 Payment",
  comments: [],
  originalText: "Payment is due within thirty days.",
  revisedText: "Payment is due within forty five days.",
  summary: "Wording revised",
}];

describe("WordComparisonPanel", () => {
  it("opens with both Word documents and diffs, then switches to the existing cards", () => {
    render(<WordComparisonPanel
      originalName="draft.docx"
      revisedName="revised.docx"
      originalHtml='<h1>Payment</h1><p>Payment is due within thirty days.</p>'
      revisedHtml='<h1>Payment</h1><p>Payment is due within forty five days.</p>'
      entries={entries}
      cardView={<p>Existing change cards</p>}
    />);

    expect(screen.getByRole("button", { name: "Side by side" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Earlier version" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Later version" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Diff" })).toBeDefined();
    expect(screen.getByText("draft.docx")).toBeDefined();
    expect(screen.getByText("revised.docx")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    expect(screen.getByText("Existing change cards")).toBeDefined();
  });

  it("selects a difference and locates its matching source sections", () => {
    render(<WordComparisonPanel
      originalName="draft.docx"
      revisedName="revised.docx"
      originalHtml='<h1>Payment</h1><p>Payment is due within thirty days.</p>'
      revisedHtml='<h1>Payment</h1><p>Payment is due within forty five days.</p>'
      entries={entries}
    />);

    const diff = screen.getByRole("button", { name: /payment.*wording revised/i });
    fireEvent.click(diff);

    expect(diff.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByLabelText("Earlier version Word document").innerHTML).toContain("data-word-change=\"delta-0-0\"");
    expect(screen.getByLabelText("Later version Word document").innerHTML).toContain("data-word-change=\"delta-0-0\"");
  });
});
