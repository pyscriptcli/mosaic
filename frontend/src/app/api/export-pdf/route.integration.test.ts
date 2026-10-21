import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

vi.mock("@/lib/access-control-server", () => ({ requireFeature: vi.fn().mockResolvedValue(null) }));

describe("POST /api/export-pdf generated document", () => {
  it("returns searchable, paginated minutes with the complete section sequence", async () => {
    const { POST } = await import("./route");
    const longDiscussion = Array.from({ length: 90 }, (_, index) => `- Update ${index + 1}: The advisor reviewed the site status, current risks, and the agreed follow-up.`).join("\n");
    const request = new NextRequest("http://localhost/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        meeting_details: { client_name: "Northstar", date: "2026-10-21", location: "Makati" },
        summary: "The team reviewed the account.",
        outcome: "The proposal is ready for approval.",
        discussion_points: [{ topic_title: "Account review", discussion_point: longDiscussion }],
        action_items: [{ discussion_point_title: "Account review", action_plan: "Send the proposal", target_date: "2026-10-30", person_in_charge: ["Mika", "Dino"] }],
        other_discussions: "The next review will be scheduled separately.",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    const pdf = await getDocument({
      data: new Uint8Array(await response.arrayBuffer()),
      verbosity: 0,
    }).promise;
    const pages = await Promise.all(Array.from({ length: pdf.numPages }, async (_, index) => {
      const page = await pdf.getPage(index + 1);
      const content = await page.getTextContent();
      return content.items.map((item) => "str" in item ? item.str : "").join(" ");
    }));
    const text = pages.join(" ");
    const headings = ["MEETING DETAILS", "OUTCOME", "ACTIONS", "DISCUSSION", "ADDITIONAL NOTES"];
    const positions = headings.map((heading) => text.indexOf(heading));

    expect(pdf.numPages).toBeGreaterThan(1);
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(text).toContain("The proposal is ready for approval.");
    expect(text).toContain("Northstar");
    expect(text).toContain("Update 90:");
    expect(text).toContain("Send the proposal");
    expect(text).toContain("Mika, Dino");
    expect(text).toContain("30 Oct 2026");
    expect(text).toContain("The next review will be scheduled separately.");
    const actionPageIndexes = pages.map((pageText, index) => pageText.includes("Send the proposal") && pageText.includes("Mika, Dino") && pageText.includes("30 Oct 2026") ? index : -1).filter((index) => index >= 0);
    expect(actionPageIndexes).toHaveLength(1);
  });
});
