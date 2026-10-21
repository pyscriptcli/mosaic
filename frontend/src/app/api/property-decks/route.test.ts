import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import { POST as compilePost } from "./compile/route";

describe("/api/property-decks API routes", () => {
  let tempDir: string;
  let sourceDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mosaic-api-decks-"));
    sourceDir = path.join(tempDir, "source");
    outputDir = path.join(tempDir, "output");
    await fs.promises.mkdir(sourceDir, { recursive: true });
    await fs.promises.mkdir(outputDir, { recursive: true });

    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:t>CARMONA INDUSTRIAL HUB</a:t></a:p><a:p><a:t>Location: Carmona, Cavite</a:t></a:p><a:p><a:t>GLA: 2,800 sqm</a:t></a:p><a:p><a:t>Lease Rate: Php 310/sqm</a:t></a:p></p:sld>`,
    );
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    await fs.promises.writeFile(path.join(sourceDir, "Carmona_Hub.pptx"), buffer);
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("indexes a folder via POST and returns the catalog via GET", async () => {
    const postReq = new Request("http://127.0.0.1:3000/api/property-decks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceFolder: sourceDir, outputFolder: outputDir }),
    });

    const postRes = await POST(postReq);
    expect(postRes.status).toBe(200);
    const postPayload = await postRes.json();
    expect(postPayload.catalog.decksCount).toBe(1);
    expect(postPayload.catalog.slides).toHaveLength(1);
    expect(postPayload.catalog.slides[0].specs.location).toContain("Cavite");

    const getRes = await GET();
    expect(getRes.status).toBe(200);
    const getPayload = await getRes.json();
    expect(getPayload.catalog.slides[0].title).toBe("CARMONA INDUSTRIAL HUB");

    const slideId = postPayload.catalog.slides[0].id;
    const compileReq = new Request("http://127.0.0.1:3000/api/property-decks/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedSlideIds: [slideId],
        overrides: { [slideId]: { leaseRate: "₱295/sqm" } },
        outputFolder: outputDir,
        proposal: {
          clientName: "LF Logistics",
          projectTitle: "Cavite Distribution Hub",
          brokerName: "Dave P.",
          brokerEmail: "dave@primephilippines.com",
          brokerPhone: "+63 917 000 0000",
          date: "2026-10-21",
          mode: "standard",
        },
      }),
    });

    const compileRes = await compilePost(compileReq);
    expect(compileRes.status).toBe(200);
    const compilePayload = await compileRes.json();
    expect(fs.existsSync(compilePayload.outputPath)).toBe(true);
    expect(compilePayload.slideCount).toBe(3);
  });
});
