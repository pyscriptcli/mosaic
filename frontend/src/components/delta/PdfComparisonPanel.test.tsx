// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PdfComparisonPanel } from "./PdfComparisonPanel";
import { comparePdfPages } from "@/lib/delta/pdfCompare";

afterEach(cleanup);

describe("PDF comparison views", () => {
  it("opens side by side, can switch to cards, and follows a selected change", () => {
    const originalPages = [{ pageNumber: 3, width: 612, height: 792, spans: [{ text: "Payment is due in thirty days.", x: 30, y: 120, width: 180, height: 12 }] }];
    const revisedPages = [{ pageNumber: 3, width: 612, height: 792, spans: [{ text: "Payment is due in forty five days.", x: 30, y: 120, width: 220, height: 12 }] }];
    const comparison = comparePdfPages(originalPages, revisedPages);

    render(<PdfComparisonPanel
      originalName="draft.pdf"
      revisedName="revised.pdf"
      originalPages={originalPages}
      revisedPages={revisedPages}
      comparison={comparison}
      cardView={<p>Existing change cards</p>}
    />);

    expect(screen.getByRole("button", { name: "Side by side" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Earlier version" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Later version" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Diff" })).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Cards" }));
    expect(screen.getByText("Existing change cards")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Side by side" }));
    fireEvent.click(screen.getByRole("button", { name: /page 3.*changed wording/i }));
    expect(screen.getByLabelText("Earlier page").getAttribute("value")).toBe("3");
    expect(screen.getByLabelText("Later page").getAttribute("value")).toBe("3");
  });

  it("opens the corresponding pages when the same clause moved to another page", () => {
    const originalPages = [
      { pageNumber: 1, width: 612, height: 792, spans: [{ text: "Start of agreement.", x: 30, y: 120, width: 90, height: 12 }] },
      { pageNumber: 2, width: 612, height: 792, spans: [{ text: "Payment remains due within thirty days.", x: 30, y: 120, width: 200, height: 12 }] },
    ];
    const revisedPages = [
      originalPages[0],
      { pageNumber: 2, width: 612, height: 792, spans: [{ text: "New permit clause.", x: 30, y: 120, width: 100, height: 12 }] },
      { pageNumber: 3, width: 612, height: 792, spans: [{ text: "Payment remains due within forty five days.", x: 30, y: 120, width: 220, height: 12 }] },
    ];
    const comparison = comparePdfPages(originalPages, revisedPages);
    render(<PdfComparisonPanel originalName="draft.pdf" revisedName="revised.pdf" originalPages={originalPages} revisedPages={revisedPages} comparison={comparison} />);

    fireEvent.click(screen.getByRole("button", { name: /earlier version page 2, later version page 3, changed wording/i }));

    expect(screen.getByLabelText("Earlier page").getAttribute("value")).toBe("2");
    expect(screen.getByLabelText("Later page").getAttribute("value")).toBe("3");
  });
});
