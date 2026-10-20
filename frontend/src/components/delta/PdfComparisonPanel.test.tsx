// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PdfComparisonPanel } from "./PdfComparisonPanel";
import { comparePdfPages } from "@/lib/delta/pdfCompare";

afterEach(cleanup);

describe("PDF comparison views", () => {
  it("keeps page and search controls beside the view selector and puts zoom presets in the overflow menu", () => {
    const originalPages = [{ pageNumber: 1, width: 612, height: 792, spans: [{ text: "Earlier clause.", x: 30, y: 120, width: 100, height: 12 }] }];
    const revisedPages = [{ pageNumber: 1, width: 612, height: 792, spans: [{ text: "Later clause.", x: 30, y: 120, width: 100, height: 12 }] }];
    const comparison = comparePdfPages(originalPages, revisedPages);
    render(<PdfComparisonPanel originalName="draft.pdf" revisedName="revised.pdf" originalPages={originalPages} revisedPages={revisedPages} comparison={comparison} />);

    const toolbar = screen.getByRole("toolbar", { name: "PDF comparison controls" });
    expect(within(toolbar).getByRole("button", { name: "Side by side" })).toBeDefined();
    expect(within(toolbar).getByLabelText("Earlier page")).toBeDefined();
    expect(within(toolbar).getByLabelText("Later page")).toBeDefined();
    expect(within(toolbar).getByRole("searchbox", { name: "Search documents" })).toBeDefined();
    expect(within(toolbar).queryByText("Sync on")).toBeNull();
    expect(within(toolbar).queryByText("Pan page")).toBeNull();
    expect(within(toolbar).queryByRole("button", { name: "Next change" })).toBeNull();

    fireEvent.click(within(toolbar).getByRole("button", { name: "Zoom options" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "125%" }));
    expect(within(toolbar).getByText("125%")).toBeDefined();

    fireEvent.click(within(toolbar).getByRole("button", { name: "Single" }));
    fireEvent.change(within(toolbar).getByRole("combobox", { name: "Single version" }), { target: { value: "revised" } });
    expect(within(toolbar).getByLabelText("Later page")).toBeDefined();
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
