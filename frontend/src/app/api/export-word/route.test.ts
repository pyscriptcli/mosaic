import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

vi.mock("@/lib/access-control-server", () => ({ requireFeature: vi.fn().mockResolvedValue(null) }));

describe("POST /api/export-word MoM structure", () => {
  it("exports sections in template order without signature fields", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/export-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_details: { client_name: "Northstar", prepared_by: "Should not appear", confirmed_by: "Should not appear" },
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
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("text");
    const content = xml.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&");
    const positions = ["MEETING DETAILS", "SUMMARY", "DISCUSSION POINTS", "ACTION ITEMS", "OTHER DISCUSSIONS"]
      .map((heading) => content.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(content).toContain("The team aligned on next steps.");
    expect(content).toContain("Send the proposal");
    expect(content).not.toContain("PRIVATE EVIDENCE QUOTE");
    expect(content).not.toContain("Should not appear");
    expect(content).not.toContain("PREPARED BY");
    expect(content).not.toContain("CONFIRMED BY");

    const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
    const discussionCards = tables.filter((table) => /Account Renewal|Market Update/.test(table) && !table.includes("Send the proposal"));
    expect(discussionCards).toHaveLength(2);
    expect(discussionCards[0]).toContain("Renewal timing was reviewed.");
    expect(discussionCards[0]).not.toContain("Send the proposal");

    const actionSection = content.slice(content.indexOf("ACTION ITEMS"), content.indexOf("OTHER DISCUSSIONS"));
    const actionHeaders = ["Discussion Point", "Action Plan", "Target Date", "Person in Charge"]
      .map((header) => actionSection.indexOf(header));
    expect(actionHeaders.every((position) => position >= 0)).toBe(true);
    expect(actionHeaders).toEqual([...actionHeaders].sort((a, b) => a - b));
    expect(actionSection).toContain("Renewal timing was reviewed.");
  });
});
