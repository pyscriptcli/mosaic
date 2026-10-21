import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const pdfCapture = vi.hoisted(() => ({ text: [] as string[], tables: [] as unknown[] }));

vi.mock("jspdf", () => ({
  jsPDF: class {
    internal = { pageSize: { getWidth: () => 210 } };
    lastAutoTable = { finalY: 50 };
    setFillColor() {}
    rect() {}
    setTextColor() {}
    setFont() {}
    setFontSize() {}
    text(value: string | string[]) { pdfCapture.text.push(...(Array.isArray(value) ? value : [value])); }
    setDrawColor() {}
    setLineWidth() {}
    splitTextToSize(value: string) { return [value]; }
    line() {}
    addPage() {}
    output() { return new ArrayBuffer(0); }
  },
}));
vi.mock("jspdf-autotable", () => ({
  default: (_doc: unknown, config: unknown) => { pdfCapture.tables.push(config); },
}));
vi.mock("@/lib/access-control-server", () => ({ requireFeature: vi.fn().mockResolvedValue(null) }));

describe("POST /api/export-pdf MoM structure", () => {
  beforeEach(() => {
    pdfCapture.text = [];
    pdfCapture.tables = [];
  });

  it("uses the requested section order, separates action items, and omits signature fields", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_details: { client_name: "Northstar", date: "2026-10-21", prepared_by: "Should not appear", confirmed_by: "Should not appear" },
        summary: "The team aligned on next steps.",
        items: [
          { topic_title: "Account Renewal", discussion_point: "Renewal timing was reviewed.", evidence_quote: "PRIVATE EVIDENCE QUOTE", action_plan: "Send the proposal", indicative_delivery_date: "Oct 30", person_in_charge: "Mika" },
          { topic_title: "Market Update", discussion_point: "Vacancy trends were discussed.", action_plan: "None" },
        ],
        other_discussions: "Team outing was mentioned.",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const renderedText = pdfCapture.text.join(" ");
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
});
