import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

vi.mock("@/lib/access-control-server", () => ({ requireFeature: vi.fn().mockResolvedValue(null) }));

describe("POST /api/export-word MoM structure", () => {
  it("exports the meeting identity, outcome, populated sections, and compact action columns", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/export-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_details: { client_name: "Northstar", prepared_by: "Should not appear", confirmed_by: "Should not appear" },
        summary: "The team aligned on next steps.",
        outcome: "Proceed after approval.",
        discussion_points: [
          { id: "dp-1", topic_title: "Account Renewal", discussion_point: "Renewal timing was reviewed.", evidence_quote: "PRIVATE EVIDENCE QUOTE" },
          { id: "dp-2", topic_title: "Market Update", discussion_point: "Vacancy trends were discussed." },
        ],
        action_items: [
          { id: "act-1", discussion_point_title: "Account Renewal", discussion_point: "Renewal timing was reviewed.", action_plan: "Send the proposal", target_date: "Oct 30", person_in_charge: ["Mika", "Dino"] },
        ],
        other_discussions: "Team outing was mentioned.",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("text");
    const content = xml.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&");
    const positions = ["MEETING DETAILS", "OUTCOME", "ACTIONS", "DISCUSSION"]
      .map((heading) => content.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(content).toContain("The team aligned on next steps.");
    expect(content).toContain("Northstar");
    expect(content).toContain("Proceed after approval.");
    expect(content).toContain("Send the proposal");
    expect(content).not.toContain("PRIVATE EVIDENCE QUOTE");
    expect(content).not.toContain("Should not appear");
    expect(content).not.toContain("PREPARED BY");
    expect(content).not.toContain("CONFIRMED BY");

    const tables = xml.match(/<w:tbl>[\s\S]*?<\/w:tbl>/g) || [];
    expect(tables).toHaveLength(2);
    expect(tables[0]).toContain("CLIENT");
    expect(tables[0]).toContain("Northstar");
    expect(tables[1]).toContain("Send the proposal");
    expect(tables[1]).toContain("A1");
    expect(tables[1]).toContain("Account Renewal: Send the proposal");
    expect(tables[1]).toContain("Mika, Dino");
    expect(tables[1]).not.toContain("Renewal timing was reviewed.");

    const actionSection = content.slice(content.indexOf("ACTIONS") + "ACTIONS".length);
    const actionHeaders = ["ID", "ACTION", "OWNER", "DUE DATE"]
      .map((header) => actionSection.indexOf(header));
    expect(actionHeaders.every((position) => position >= 0)).toBe(true);
    expect(actionHeaders).toEqual([...actionHeaders].sort((a, b) => a - b));
    expect(xml).toMatch(/<w:spacing[^>]*w:line="270"[^>]*w:lineRule="auto"/);
    expect(xml).not.toContain('<w:jc w:val="both"');
    expect(xml).toContain('<w:jc w:val="left"');
    expect(xml).toContain('w:val="30"');
    expect(xml).toContain('w:color="FFFCFB"');
    expect(xml).toContain('w:ascii="Arial"');
    expect(xml).toContain('w:ascii="Georgia"');
    expect(xml).not.toContain('w:fill="1A1A1A"');
    expect(xml).not.toContain('w:fill="FAF9F7"');
    expect(xml).not.toContain('w:fill="F8F6F2"');
    expect(tables[1]).toContain("<w:tblHeader");
    expect(tables[1]).toContain("<w:cantSplit");
    const footer = await zip.file("word/footer1.xml")!.async("text");
    expect(footer).toContain("PAGE");
    expect(footer).toContain("NUMPAGES");
  });

  it("keeps the meeting outcome separate and exports discussion bullets with selective emphasis", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/export-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: "The team reviewed the proposal.\n\nBottom line: **Prime will proceed** after site approval.",
        discussion_points: [{
          topic_title: "Account update",
          discussion_point: "The team reviewed the renewal.\n- **PHP 250,000** fee remains unchanged.",
        }],
      }),
    });
    const response = await POST(request);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("text");
    const content = xml.replace(/<[^>]+>/g, "").replaceAll("&amp;", "&");

    expect(response.status).toBe(200);
    expect(content).toContain("The team reviewed the proposal.");
    expect(content).toContain("OUTCOME");
    expect(content).toContain("Prime will proceed after site approval.");
    expect(content).toContain("The team reviewed the renewal.");
    expect(content).toContain("PHP 250,000 fee remains unchanged.");
    expect(xml).toContain("<w:b");
    expect(xml).toContain("<w:numPr>");
  });

  it("leaves missing action dates and assignees blank", async () => {
    const { POST } = await import("./route");
    const request = new NextRequest("http://localhost/api/export-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_details: { client_name: "Northstar" },
        discussion_points: [{ topic_title: "Site review", discussion_point: "A candidate site was reviewed." }],
        action_items: [{ discussion_point_title: "Site review", action_plan: "Share the inspection report", target_date: "TBD", person_in_charge: "Unassigned" }],
      }),
    });
    const response = await POST(request);
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("text");
    const content = xml.replace(/<[^>]+>/g, "");

    expect(response.status).toBe(200);
    expect(content).toContain("ACTIONS");
    expect(content).toContain("Not recorded");
    expect(content).not.toContain("TBD");
    expect(content).not.toContain("Unassigned");
    expect((xml.match(/<w:tbl>/g) || [])).toHaveLength(2);
  });

  it("omits the action plan heading and table when no action exists", async () => {
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/export-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meeting_details: { client_name: "Northstar" }, discussion_points: [{ topic_title: "Site review", discussion_point: "The candidate site was reviewed." }] }),
    }));
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("text");
    const content = xml.replace(/<[^>]+>/g, "");

    expect(response.status).toBe(200);
    expect(content).not.toContain("ACTIONS");
    expect(content).not.toContain("ADDITIONAL NOTES");
    expect((xml.match(/<w:tbl>/g) || [])).toHaveLength(1);
  });

  it("omits the meeting details section when no details are supplied", async () => {
    const { POST } = await import("./route");
    const response = await POST(new NextRequest("http://localhost/api/export-word", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ summary: "A brief update." }),
    }));
    const zip = await JSZip.loadAsync(await response.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("text");

    expect(response.status).toBe(200);
    expect(xml).not.toContain("MEETING DETAILS");
  });
});
