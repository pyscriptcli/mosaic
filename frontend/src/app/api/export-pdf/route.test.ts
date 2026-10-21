import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const pdfCapture = vi.hoisted(() => ({ text: [] as string[], events: [] as string[], tables: [] as unknown[], fills: [] as unknown[][], lineHeight: 0, alignedText: [] as unknown[], fontStyle: "normal", formattedRuns: [] as { style: string; text: string }[] }));

vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 210 } };
    lastAutoTable = { finalY: 50 };
    setFillColor(...value: number[]) { pdfCapture.fills.push(value); }
    rect() {}
    setTextColor() {}
    setFont(_family: string, style = "normal") { pdfCapture.fontStyle = style; }
    setFontSize() {}
    setLineHeightFactor(value: number) { pdfCapture.lineHeight = value; }
    text(value: string | string[], _x?: number, _y?: number, options?: unknown) {
      pdfCapture.text.push(...(Array.isArray(value) ? value : [value]));
      pdfCapture.events.push(...(Array.isArray(value) ? value : [value]));
      pdfCapture.formattedRuns.push({ style: pdfCapture.fontStyle, text: Array.isArray(value) ? value.join(" ") : value });
      if (options) pdfCapture.alignedText.push(options);
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
  default: (_doc: unknown, config: any) => {
    pdfCapture.tables.push(config);
    pdfCapture.events.push(JSON.stringify(config));
    config.body?.forEach((row: unknown[]) => row.forEach((value, index) => {
      const data = { section: "body", column: { index }, row: { index: 0 }, cell: { text: String(value).split("\n"), styles: { ...config.bodyStyles }, x: 0, y: 0, padding: () => 2 } };
      config.didParseCell?.(data);
      config.didDrawCell?.(data);
    }));
  },
}));
vi.mock("@/lib/access-control-server", () => ({ requireFeature: vi.fn().mockResolvedValue(null) }));

describe("POST /api/export-pdf MoM structure", () => {
  beforeEach(() => {
    pdfCapture.text = [];
    pdfCapture.events = [];
    pdfCapture.tables = [];
    pdfCapture.fills = [];
    pdfCapture.lineHeight = 0;
    pdfCapture.alignedText = [];
    pdfCapture.fontStyle = "normal";
    pdfCapture.formattedRuns = [];
  });

  it("uses the requested section order, separates action items, and omits signature fields", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_details: { client_name: "Northstar", date: "2026-10-21", prepared_by: "Should not appear", confirmed_by: "Should not appear" },
        summary: "The team aligned on next steps.",
        discussion_points: [
          { id: "dp-1", topic_title: "Account Renewal", discussion_point: "Renewal timing was reviewed.", evidence_quote: "PRIVATE EVIDENCE QUOTE" },
          { id: "dp-2", topic_title: "Market Update", discussion_point: "Vacancy trends were discussed." },
        ],
        action_items: [
          { id: "act-1", discussion_point_title: "Account Renewal", discussion_point: "Renewal timing was reviewed.", action_plan: "Send the proposal", target_date: "Oct 30", person_in_charge: "Mika" },
        ],
        other_discussions: "Team outing was mentioned.",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const renderedText = pdfCapture.events.join(" ");
    const positions = ["MEETING DETAILS", "SUMMARY", "DISCUSSION POINTS", "ACTION ITEMS", "OTHER DISCUSSIONS"]
      .map((heading) => renderedText.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(renderedText).toContain("The team aligned on next steps.");
    expect(renderedText).not.toContain("PRIVATE EVIDENCE QUOTE");
    expect(renderedText).not.toContain("Should not appear");
    const renderedTables = pdfCapture.tables as { head?: unknown[][]; body?: unknown[][] }[];
    const discussionCards = renderedTables.filter((table) => {
      const serialized = JSON.stringify(table);
      return (serialized.includes("Account Renewal") || serialized.includes("Market Update")) && !serialized.includes("Send the proposal");
    });
    expect(discussionCards).toHaveLength(2);
    expect(JSON.stringify(discussionCards)).toContain("Renewal timing was reviewed.");
    expect(JSON.stringify(discussionCards)).not.toContain("Send the proposal");

    const actionTable = renderedTables.find((table) => JSON.stringify(table.head || []).includes("Discussion Point"));
    expect(actionTable?.head?.[0]).toEqual(["Discussion Point", "Action Plan", "Target Date", "Person in Charge"]);
    expect(JSON.stringify(actionTable?.body)).toContain("Renewal timing was reviewed.");
    expect(JSON.stringify(actionTable?.body)).toContain("Send the proposal");
  });

  it("exports left-aligned, readable paragraphs and real bullets without markdown escapes", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_details: { client_name: "Northstar" },
        summary: "The meeting covered renewal status.",
        discussion_points: [{ topic_title: "Account Update", discussion_point: "- Prime was founded in \\*\\*2013\\*\\*." }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(pdfCapture.lineHeight).toBe(1.15);
    expect(pdfCapture.alignedText).not.toContainEqual(expect.objectContaining({ align: "justify" }));
    const renderedTables = JSON.stringify(pdfCapture.tables);
    expect(renderedTables).toContain('"halign":"left"');
    expect(renderedTables).not.toContain('"halign":"justify"');
    expect(renderedTables).toContain("• Prime was founded in 2013.");
    expect(pdfCapture.fills).toEqual([]);
    expect(renderedTables).toContain('"fillColor":[255,252,251]');
    expect(renderedTables).toContain('"textColor":[24,29,30]');
    expect(renderedTables).not.toContain("\\\\*\\\\*");
  });

  it("keeps each discussion point to a title row and one combined details row", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_details: { client_name: "Northstar" },
        discussion_points: [{
          topic_title: "Account update",
          discussion_point: "The team reviewed the renewal status.\n- The client approved the revised terms.\n- **PHP 250,000** fee remains unchanged.",
        }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const discussionTable = (pdfCapture.tables as { head?: string[][]; body?: unknown[][]; headStyles?: object; bodyStyles?: object }[])
      .find((table) => table.head?.[0]?.[0] === "Account update");

    expect(discussionTable?.head).toEqual([["Account update"]]);
    expect(discussionTable?.body).toHaveLength(1);
    expect(JSON.stringify(discussionTable?.body)).toContain("The team reviewed the renewal status.");
    expect(JSON.stringify(discussionTable?.body)).toContain("• The client approved the revised terms.");
    expect(JSON.stringify(discussionTable?.body)).toContain("• PHP 250,000 fee remains unchanged.");
    expect(pdfCapture.formattedRuns).toContainEqual({ style: "bold", text: "PHP 250,000" });
    expect(discussionTable?.headStyles).toMatchObject({ fontSize: 15 });
    expect(discussionTable?.bodyStyles).toMatchObject({ fontSize: 10, halign: "left" });
  });

  it("uses the editorial record hierarchy for summary and action tables", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_details: { client_name: "Northstar", date: "2026-10-21" },
        summary: "The team aligned on a pilot.\n\nBottom line stays to confirm.",
        discussion_points: [{ topic_title: "Pilot scope", discussion_point: "The service scope was reviewed." }],
        action_items: [{ discussion_point_title: "Pilot scope", discussion_point: "The service scope was reviewed.", action_plan: "Send the final brief", person_in_charge: "Mika" }],
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const tables = pdfCapture.tables as { head?: string[][]; body?: unknown[][]; theme?: string; headStyles?: Record<string, unknown>; bodyStyles?: Record<string, unknown> }[];
    const summary = tables.find((table) => JSON.stringify(table.body || []).includes("The team aligned on a pilot."));
    const actions = tables.find((table) => table.head?.[0]?.[0] === "Discussion Point");

    expect(summary?.theme).toBe("plain");
    expect(summary?.bodyStyles).toMatchObject({ fillColor: [255, 252, 251], textColor: [24, 29, 30], halign: "left" });
    expect(actions?.theme).toBe("plain");
    expect(actions?.headStyles).toMatchObject({ fillColor: [255, 252, 251], textColor: [0, 51, 102] });
    expect(actions?.bodyStyles).toMatchObject({ fillColor: [255, 252, 251], textColor: [24, 29, 30], halign: "left" });
  });
});
