import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type PdfTableConfig = {
  head?: unknown[][];
  body?: unknown[][];
  headStyles?: Record<string, unknown>;
  bodyStyles?: Record<string, unknown>;
  styles?: Record<string, unknown>;
  columnStyles?: Record<number, Record<string, unknown>>;
  theme?: string;
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
    setProperties() {}
    getNumberOfPages() { return 1; }
    setPage() {}
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

  it("exports the meeting identity, explicit outcome, populated sections, and compact actions", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      meeting_details: { client_name: "Northstar", date: "2026-10-21", location: "Makati", prepared_by: "Should not appear", confirmed_by: "Should not appear" },
      summary: "The team aligned on next steps.",
      outcome: "Proceed after approval.",
      discussion_points: [
        { topic_title: "Account Renewal", discussion_point: "Renewal timing was reviewed.\n- The client approved the terms.", evidence_quote: "PRIVATE EVIDENCE QUOTE" },
        { topic_title: "Market Update", discussion_point: "Vacancy trends were discussed." },
      ],
      action_items: [{ discussion_point_title: "Account Renewal", discussion_point: "Renewal timing was reviewed.", action_plan: "Send the proposal", target_date: "Oct 30", person_in_charge: ["Mika", "Dino"] }],
      other_discussions: "Team outing was mentioned.",
    }));

    const renderedText = pdfCapture.events.join(" ");
    const sectionPositions = ["MEETING DETAILS", "OUTCOME", "ACTIONS", "DISCUSSION", "ADDITIONAL NOTES"]
      .map((heading) => renderedText.indexOf(heading));
    expect(response.status).toBe(200);
    expect(renderedText).toContain("Northstar");
    expect(sectionPositions.slice(0, 4).every((position) => position >= 0)).toBe(true);
    expect(sectionPositions.slice(0, 4)).toEqual([...sectionPositions.slice(0, 4)].sort((a, b) => a - b));
    expect(renderedText).toContain("The team aligned on next steps.");
    expect(renderedText).toContain("Proceed after approval.");
    expect(renderedText).toContain("•");
    expect(renderedText).toContain("Renewal timing was reviewed.");
    expect(renderedText).toContain("Send the proposal");
    expect(renderedText).toContain("Mika, Dino");
    expect(renderedText).not.toContain("PRIVATE EVIDENCE QUOTE");
    expect(renderedText).not.toContain("Should not appear");

    expect(pdfCapture.tables).toHaveLength(2);
    const detailsTable = pdfCapture.tables[0];
    expect(detailsTable.body?.map((row) => row[0])).toContain("CLIENT");
    expect(detailsTable.body?.map((row) => row[0])).toContain("DATE");
    expect(detailsTable.body?.map((row) => row[1])).toContain("Northstar");
    expect(detailsTable.theme).toBe("plain");
    expect(detailsTable.styles).toMatchObject({ fillColor: [255, 252, 251], halign: "left" });
    expect(detailsTable.columnStyles?.[0]).toMatchObject({ fontStyle: "bold", textColor: [0, 51, 102] });
    const actionTable = pdfCapture.tables[1];
    expect(actionTable.head?.[0]).toEqual(["ID", "ACTION", "OWNER", "DUE DATE"]);
    expect(actionTable.body?.[0]).toEqual(["A1", "Account Renewal: Send the proposal", "Mika, Dino", "Oct 30"]);
    expect(JSON.stringify(actionTable.body?.[0])).not.toContain("Renewal timing was reviewed.");
    expect(actionTable.bodyStyles).toMatchObject({ halign: "left", fontSize: 9.5 });
    expect(actionTable.columnStyles).toMatchObject({ 0: { cellWidth: 12 }, 1: { cellWidth: 90 }, 2: { cellWidth: 39 }, 3: { cellWidth: 29 } });
    expect(actionTable.headStyles?.halign).toBe("left");
  });

  it("keeps paragraphs left aligned, renders bold inline text, and omits an empty action section", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      meeting_details: { client_name: "Northstar" },
      summary: "A short summary.\n\nBottom line: **Keep the current site plan.**",
      discussion_points: [{ topic_title: "Fee review", discussion_point: "The fee is **PHP 250,000**.\n- The subsidy remains subject to approval." }],
    }));

    expect(response.status).toBe(200);
    expect(pdfCapture.tables).toHaveLength(1);
    expect(pdfCapture.events.join(" ")).not.toContain("ACTIONS");
    expect(pdfCapture.events.join(" ")).not.toContain("ADDITIONAL NOTES");
    expect(pdfCapture.text).toContain("PHP 250,000");
    expect(pdfCapture.runs).toContainEqual({ style: "bold", text: "PHP 250,000" });
    expect(pdfCapture.fontSizes).toContain(24);
    expect(pdfCapture.fontSizes).toContain(15);
    expect(pdfCapture.text).not.toContain("PRIVATE EVIDENCE QUOTE");
  });

  it("omits the meeting details section when no details are supplied", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ summary: "A brief update." }));

    expect(response.status).toBe(200);
    expect(pdfCapture.events.join(" ")).not.toContain("MEETING DETAILS");
  });
});
