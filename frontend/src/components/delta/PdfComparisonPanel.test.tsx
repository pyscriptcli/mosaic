// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PdfComparisonPanel } from "./PdfComparisonPanel";
import { comparePdfPages } from "@/lib/delta/pdfCompare";

afterEach(cleanup);

describe("PDF comparison views", () => {
  it("right-aligns search, paired-page arrows, and zoom options after the view selector", () => {
    const originalPages = [{ pageNumber: 1, width: 612, height: 792, spans: [{ text: "Earlier clause.", x: 30, y: 120, width: 100, height: 12 }] }];
    const revisedPages = [{ pageNumber: 1, width: 612, height: 792, spans: [{ text: "Later clause.", x: 30, y: 120, width: 100, height: 12 }] }];
    const comparison = comparePdfPages(originalPages, revisedPages);
    render(<PdfComparisonPanel originalName="draft.pdf" revisedName="revised.pdf" originalPages={originalPages} revisedPages={revisedPages} comparison={comparison} />);

    const toolbar = screen.getByRole("toolbar", { name: "PDF comparison controls" });
    expect(within(toolbar).getByRole("button", { name: "Side by side" })).toBeDefined();
    expect(within(toolbar).getByRole("group", { name: "Page pair selector" })).toBeDefined();
    expect(within(toolbar).getByRole("button", { name: "Previous page pair" })).toBeDefined();
    expect(within(toolbar).getByRole("searchbox", { name: "Search documents" })).toBeDefined();
    expect(within(toolbar).queryByText("Sync on")).toBeNull();
    expect(within(toolbar).queryByText("Pan page")).toBeNull();
    expect(within(toolbar).queryByRole("button", { name: "Next change" })).toBeNull();

    fireEvent.click(within(toolbar).getByRole("button", { name: "Zoom options" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "125%" }));
    expect(within(toolbar).getByText("125%")).toBeDefined();

    fireEvent.click(within(toolbar).getByRole("button", { name: "Single" }));
    fireEvent.change(within(toolbar).getByRole("combobox", { name: "Single version" }), { target: { value: "revised" } });
    expect(within(toolbar).getByRole("group", { name: "Page selector" })).toBeDefined();
    expect(within(toolbar).getByRole("button", { name: "Next page" })).toBeDefined();
  });

  it("moves both source panes by matched page pair and keeps the selected difference identified", () => {
    const originalPages = [1, 2].map((pageNumber) => ({ pageNumber, width: 612, height: 792, spans: [{ text: pageNumber === 1 ? "Start clause." : "Earlier target clause.", x: 30, y: 160, width: 180, height: 12 }] }));
    const revisedPages = [1, 2].map((pageNumber) => ({ pageNumber, width: 612, height: 792, spans: [{ text: pageNumber === 1 ? "Start clause." : "Later target clause.", x: 30, y: 160, width: 180, height: 12 }] }));
    const comparison = comparePdfPages(originalPages, revisedPages);
    render(<PdfComparisonPanel originalName="draft.pdf" revisedName="revised.pdf" originalPages={originalPages} revisedPages={revisedPages} comparison={comparison} />);
    const toolbar = screen.getByRole("toolbar", { name: "PDF comparison controls" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Next page pair" }));
    expect(within(toolbar).getByText("2 / 2")).toBeDefined();
    const difference = screen.getByRole("button", { name: /earlier version page 2, later version page 2/i });
    fireEvent.click(difference);
    expect(difference.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelectorAll('[data-selected-diff-region="true"]').length).toBeGreaterThan(0);
  });

  it("keeps the point at the pane center fixed when a zoom preset is selected", () => {
    const originalPages = [{ pageNumber: 1, width: 612, height: 792, spans: [{ text: "Earlier clause.", x: 30, y: 120, width: 100, height: 12 }] }];
    const revisedPages = [{ pageNumber: 1, width: 612, height: 792, spans: [{ text: "Later clause.", x: 30, y: 120, width: 100, height: 12 }] }];
    const comparison = comparePdfPages(originalPages, revisedPages);
    const { container } = render(<PdfComparisonPanel originalName="draft.pdf" revisedName="revised.pdf" originalPages={originalPages} revisedPages={revisedPages} comparison={comparison} />);
    const pane = screen.getByLabelText("Earlier version PDF").querySelector<HTMLElement>(".overflow-auto")!;
    const page = pane.querySelector<HTMLElement>("[data-pdf-page='1']")!;
    Object.defineProperty(pane, "clientWidth", { configurable: true, value: 600 });
    Object.defineProperty(pane, "clientHeight", { configurable: true, value: 700 });
    pane.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 700, width: 600, height: 700, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
    pane.scrollTop = 50;
    page.getBoundingClientRect = () => {
      const scale = Number.parseFloat(page.parentElement?.getAttribute("style")?.match(/width: ([\d.]+)%/)?.[1] || "100") / 100;
      const left = 100 * scale - pane.scrollLeft;
      const top = 100 * scale - pane.scrollTop;
      const width = 400 * scale;
      const height = 800 * scale;
      return { left, top, right: left + width, bottom: top + height, width, height, x: left, y: top, toJSON: () => ({}) } as DOMRect;
    };
    const centerBefore = () => {
      const bounds = page.getBoundingClientRect();
      const x = bounds.left + bounds.width / 2;
      const y = bounds.top + bounds.height * 0.375;
      return { x, y };
    };
    const before = centerBefore();
    const toolbar = within(container).getByRole("toolbar", { name: "PDF comparison controls" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Zoom options" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "125%" }));

    const after = centerBefore();
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("uses the inline document search to jump both page selectors to matching pages", () => {
    const firstPage = { pageNumber: 1, width: 612, height: 792, spans: [{ text: "General terms.", x: 30, y: 120, width: 100, height: 12 }] };
    const originalPages = [firstPage, { ...firstPage, pageNumber: 2, spans: [{ ...firstPage.spans[0], text: "Invoice is due within thirty days." }] }];
    const revisedPages = [firstPage, { ...firstPage, pageNumber: 2, spans: [{ ...firstPage.spans[0], text: "Invoice is due within forty-five days." }] }];
    const comparison = comparePdfPages(originalPages, revisedPages);
    render(<PdfComparisonPanel originalName="draft.pdf" revisedName="revised.pdf" originalPages={originalPages} revisedPages={revisedPages} comparison={comparison} />);
    const search = screen.getByRole("searchbox", { name: "Search documents" });

    fireEvent.change(search, { target: { value: "invoice" } });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(within(screen.getByRole("toolbar", { name: "PDF comparison controls" })).getByText("2 / 2")).toBeDefined();
  });

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
    expect(screen.getAllByText("Page 3 of 3").length).toBeGreaterThan(0);
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

    expect(screen.getByText("Page 2 of 2")).toBeDefined();
    expect(screen.getByText("Page 3 of 3")).toBeDefined();
  });

  it("keeps a working built-in Cards view when no custom card renderer is supplied", () => {
    const originalPages = [{ pageNumber: 1, width: 612, height: 792, spans: [{ text: "Payment is due in thirty days.", x: 30, y: 120, width: 180, height: 12 }] }];
    const revisedPages = [{ pageNumber: 1, width: 612, height: 792, spans: [{ text: "Payment is due in forty five days.", x: 30, y: 120, width: 220, height: 12 }] }];
    const comparison = comparePdfPages(originalPages, revisedPages);
    render(<PdfComparisonPanel originalName="draft.pdf" revisedName="revised.pdf" originalPages={originalPages} revisedPages={revisedPages} comparison={comparison} />);

    fireEvent.click(screen.getByRole("button", { name: "Cards" }));

    expect(screen.getByRole("region", { name: "PDF change cards" })).toBeDefined();
    expect(screen.getByText("thirty")).toBeDefined();
    expect(screen.getByText("forty five")).toBeDefined();
  });
});
