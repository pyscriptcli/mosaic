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
    expect(discussionCards.map((card) => (card.match(/<w:tr\b/g) || []).length)).toEqual([2, 2]);

    const actionSection = content.slice(content.indexOf("ACTION ITEMS"), content.indexOf("OTHER DISCUSSIONS"));
    const actionHeaders = ["Discussion Point", "Action Plan", "Target Date", "Person in Charge"]
      .map((header) => actionSection.indexOf(header));
    expect(actionHeaders.every((position) => position >= 0)).toBe(true);
    expect(actionHeaders).toEqual([...actionHeaders].sort((a, b) => a - b));
    expect(actionSection).toContain("Renewal timing was reviewed.");
    expect(xml).toMatch(/<w:spacing[^>]*w:line="276"[^>]*w:lineRule="auto"/);
    expect(xml).not.toContain('<w:jc w:val="both"');
    expect(xml).toContain('<w:jc w:val="left"');
    expect(discussionCards[0]).toContain('w:val="34"');
    expect(xml).toContain('w:fill="FFFCFB"');
    expect(xml).toContain('w:ascii="Montserrat"');
    expect(xml).toContain('w:ascii="Cormorant Garamond"');
    expect(xml).not.toContain('w:fill="1A1A1A"');
    expect(xml).not.toContain('w:fill="FAF9F7"');
    expect(xml).not.toContain('w:fill="F8F6F2"');
  });
});
