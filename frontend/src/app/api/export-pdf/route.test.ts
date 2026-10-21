import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type PdfTableConfig = {
  head?: unknown[][];
  body?: unknown[][];
  headStyles?: Record<string, unknown>;
  bodyStyles?: Record<string, unknown>;
};

const pdfCapture = vi.hoisted(() => ({ text: [] as string[], events: [] as string[], tables: [] as PdfTableConfig[], fontStyle: "normal", fontSizes: [] as number[], runs: [] as { style: string; text: string }[] }));

vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } };
    lastAutoTable = { finalY: 120 };
    setFillColor() {}
    rect() {}
    setTextColor() {}
    setFont(_family: string, style = "normal") { pdfCapture.fontStyle = style; }
    setFontSize(size: number) { pdfCapture.fontSizes.push(size); }
    setLineHeightFactor() {}
    text(value: string | string[]) {
      const values = Array.isArray(value) ? value : [value];
      pdfCapture.text.push(...values);
      pdfCapture.events.push(...values);
      values.forEach((text) => pdfCapture.runs.push({ style: pdfCapture.fontStyle, text }));
    }
    setDrawColor() {}
    setLineWidth() {}
    splitTextToSize(value: string) { return [value]; }
    getTextWidth(value: string) { return value.length; }
    line() {}
    addPage() {}
    output() { return new ArrayBuffer(0); }
  },
}));
vi.mock("jspdf-autotable", () => ({
    default: (_doc: unknown, config: PdfTableConfig) => {
    pdfCapture.tables.push(config);
    pdfCapture.events.push(JSON.stringify(config));
  },
}));
vi.mock("@/lib/access-control-server", () => ({ requireFeature: vi.fn().mockResolvedValue(null) }));

function request(body: unknown) {
  return new NextRequest("http://localhost/api/export-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/export-pdf MoM structure", () => {
  beforeEach(() => {
    pdfCapture.text = [];
    pdfCapture.events = [];
    pdfCapture.tables = [];
    pdfCapture.fontStyle = "normal";
    pdfCapture.fontSizes = [];
    pdfCapture.runs = [];
  });

  it("exports the PRIME section order and uses a single table for action plans", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      meeting_details: { client_name: "Northstar", date: "2026-10-21", location: "Makati", prepared_by: "Should not appear", confirmed_by: "Should not appear" },
      summary: "The team aligned on next steps.\n\nBottom line: **Proceed after approval.**",
      discussion_points: [
        { topic_title: "Account Renewal", discussion_point: "Renewal timing was reviewed.\n- The client approved the terms.", evidence_quote: "PRIVATE EVIDENCE QUOTE" },
        { topic_title: "Market Update", discussion_point: "Vacancy trends were discussed." },
      ],
      action_items: [{ discussion_point_title: "Account Renewal", discussion_point: "Renewal timing was reviewed.", action_plan: "Send the proposal", target_date: "Oct 30", person_in_charge: ["Mika", "Dino"] }],
      other_discussions: "Team outing was mentioned.",
    }));

    const renderedText = pdfCapture.events.join(" ");
    const sectionPositions = ["MEETING DETAILS", "SUMMARY", "DISCUSSION POINTS", "ACTION PLAN", "OTHER DISCUSSIONS"]
      .map((heading) => renderedText.indexOf(heading));
    expect(response.status).toBe(200);
    expect(sectionPositions.every((position) => position >= 0)).toBe(true);
    expect(sectionPositions).toEqual([...sectionPositions].sort((a, b) => a - b));
    expect(renderedText).toContain("The team aligned on next steps.");
    expect(renderedText).toContain("Proceed after approval.");
    expect(renderedText).toContain("•");
    expect(renderedText).toContain("Renewal timing was reviewed.");
    expect(renderedText).toContain("Send the proposal");
    expect(renderedText).toContain("Mika, Dino");
    expect(renderedText).not.toContain("PRIVATE EVIDENCE QUOTE");
    expect(renderedText).not.toContain("Should not appear");

    expect(pdfCapture.tables).toHaveLength(1);
    const actionTable = pdfCapture.tables[0];
    expect(actionTable.head?.[0]).toEqual(["Discussion Point", "Action Plan", "Target Date", "Person in Charge"]);
    expect(actionTable.body?.[0]).toEqual(["Account Renewal", "Send the proposal", "Oct 30", "Mika, Dino"]);
    expect(JSON.stringify(actionTable.body?.[0])).not.toContain("Renewal timing was reviewed.");
    expect(actionTable.bodyStyles).toMatchObject({ halign: "left", fontSize: 9.5 });
    expect(actionTable.headStyles?.halign).toBe("left");
  });

  it("keeps paragraphs left aligned, renders bold inline text, and omits an empty action section", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      summary: "A short summary.\n\nBottom line: **Keep the current site plan.**",
      discussion_points: [{ topic_title: "Fee review", discussion_point: "The fee is **PHP 250,000**.\n- The subsidy remains subject to approval." }],
    }));

    expect(response.status).toBe(200);
    expect(pdfCapture.tables).toHaveLength(0);
    expect(pdfCapture.events.join(" ")).not.toContain("ACTION PLAN");
    expect(pdfCapture.text).toContain("PHP 250,000");
    expect(pdfCapture.runs).toContainEqual({ style: "bold", text: "PHP 250,000" });
    expect(pdfCapture.fontSizes).toContain(22);
    expect(pdfCapture.fontSizes).toContain(14);
    expect(pdfCapture.text).not.toContain("PRIVATE EVIDENCE QUOTE");
  });
});
