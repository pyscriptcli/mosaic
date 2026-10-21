import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCompilationManifest } from "./property-decks";
import { compilePropertyDeck, scanOneDriveFolder } from "./property-decks-server";

async function createSamplePptx(filePath: string, slidesXml: string[]) {
  const zip = new JSZip();
  slidesXml.forEach((xml, idx) => {
    zip.file(`ppt/slides/slide${idx + 1}.xml`, xml);
  });
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await fs.promises.writeFile(filePath, buffer);
}

describe("Property Decks server indexer and compiler", () => {
  let tempDir: string;
  let sourceDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mosaic-decks-test-"));
    sourceDir = path.join(tempDir, "source");
    outputDir = path.join(tempDir, "output");
    await fs.promises.mkdir(sourceDir, { recursive: true });
    await fs.promises.mkdir(outputDir, { recursive: true });

    const deck1Path = path.join(sourceDir, "PRIME_Laguna_Industrial.pptx");
    await createSamplePptx(deck1Path, [
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:t>PROPERTY INFORMATION SHEET</a:t>
        <a:t>Prepared Exclusively For: Client</a:t>
      </p:sld>`,
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
        <a:t>STA. ROSA LOGISTICS PARK - BUILDING A</a:t>
        <a:t>Location: Sta. Rosa, Laguna</a:t>
        <a:t>Gross Leasable Area: 5,400 sqm</a:t>
        <a:t>Clear Ceiling Height: 12m (Apex)</a:t>
        <a:t>Lease Rate: Php 340 / sqm</a:t>
        <a:t>Power Supply: 3-Phase</a:t>
        <a:t>Loading Bays: 8 Elevated Bays</a:t>
      </p:sld>`,
    ]);
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it("scans a local OneDrive folder and indexes PPTX slides and warehouse specifications", async () => {
    const catalog = await scanOneDriveFolder(sourceDir, outputDir);

    expect(catalog.decksCount).toBe(1);
    expect(catalog.slides).toHaveLength(2);
    expect(catalog.slides[0].slideRole).toBe("cover");

    const warehouseSlide = catalog.slides[1];
    expect(warehouseSlide.slideRole).toBe("property");
    expect(warehouseSlide.title).toBe("STA. ROSA LOGISTICS PARK - BUILDING A");
    expect(warehouseSlide.specs.location).toContain("Laguna");
    expect(warehouseSlide.specs.gla).toBe("5,400 sqm");
    expect(warehouseSlide.specs.leaseRate).toContain("340");
  });

  it("compiles both Standard and Comprehensive PPTX proposals to the output folder", async () => {
    const catalog = await scanOneDriveFolder(sourceDir, outputDir);
    const warehouseSlide = catalog.slides[1];

    const comprehensiveManifest = buildCompilationManifest({
      selectedSlideIds: [warehouseSlide.id],
      catalogSlides: catalog.slides,
      overrides: {
        [warehouseSlide.id]: {
          leaseRate: "₱315/sqm (Special Client Rate)",
          notes: "Handover ready Q4 2026",
        },
      },
      proposal: {
        clientName: "Kuehne + Nagel",
        projectTitle: "Laguna Regional Hub",
        brokerName: "Dave P.",
        brokerEmail: "dave@primephilippines.com",
        brokerPhone: "+63 917 000 0000",
        date: "2026-10-21",
        mode: "comprehensive",
      },
    });

    const compiled = await compilePropertyDeck({
      manifest: comprehensiveManifest,
      outputFolder: outputDir,
    });

    expect(fs.existsSync(compiled.outputPath)).toBe(true);
    expect(compiled.fileName).toMatch(/Kuehne_Nagel/i);
    expect(compiled.slideCount).toBeGreaterThanOrEqual(4);
  });
});
