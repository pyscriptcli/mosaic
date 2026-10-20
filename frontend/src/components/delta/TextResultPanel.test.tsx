// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TextResultPanel } from "./TextResultPanel";
import type { DeltaEntry } from "@/lib/delta/compare";

afterEach(cleanup);

const entry = (id: string, originalText: string, revisedText: string): DeltaEntry => ({
  id, section: id, originalSection: id, revisedSection: id, comments: [], originalText, revisedText, summary: "Wording revised",
});

describe("text comparison view", () => {
  it("lets users navigate changes and keeps both version labels visible", () => {
    render(<TextResultPanel earlierName="draft.txt" laterName="final.txt" earlierText="Earlier" laterText="Later" entries={[entry("Payment", "30 days", "45 days"), entry("Term", "One year", "Two years")]} />);
    expect(screen.getByRole("region", { name: "Earlier version" }).textContent).toContain("draft.txt");
    expect(screen.getByRole("region", { name: "Later version" }).textContent).toContain("final.txt");
    expect(screen.getByRole("region", { name: "Section change summaries" }).querySelectorAll("details")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Next change" }));
    expect(screen.getByText("Change 2 of 2")).toBeTruthy();
    expect(screen.getByLabelText("Earlier wording").querySelector("del")?.textContent).toBe("One");
    expect(screen.getByLabelText("Earlier wording").textContent).toBe("One year");
    expect(screen.getByLabelText("Later wording").querySelector("ins")?.textContent).toBe("Two");
    expect(screen.getByLabelText("Later wording").textContent).toBe("Two years");
    expect(screen.getByRole("region", { name: "Section change summaries" }).querySelector("details[open]")?.textContent).toContain("Term");
  });
});
