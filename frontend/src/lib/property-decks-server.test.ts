import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCompilationManifest } from "./property-decks";
import { compilePropertyDeck, findAvailableProposalPath, scanPropertyDeckFolder } from "./property-decks-server";

async function createSamplePptx(filePath: string, slidesXml: string[]) {
  const zip = new JSZip();
  slidesXml.forEach((xml, idx) => {
    zip.file(`ppt/slides/slide${idx + 1}.xml`, xml);
  });
  const slideIds = slidesXml.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
  const relationships = slidesXml
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`)
    .join("");
  const slideOverrides = slidesXml
    .map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join("");
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slideOverrides}</Types>`);
  zip.file("_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`);
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

  it("scans a local folder and indexes PPTX slides and warehouse specifications", async () => {
    const catalog = await scanPropertyDeckFolder(sourceDir, outputDir);

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

  it.skipIf(process.platform === "win32")("copies only the selected source slide to the output folder", async () => {
    const catalog = await scanPropertyDeckFolder(sourceDir, outputDir);
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
    expect(compiled.slideCount).toBe(1);
    const source = await JSZip.loadAsync(await fs.promises.readFile(warehouseSlide.deckFilePath));
    const output = await JSZip.loadAsync(await fs.promises.readFile(compiled.outputPath));
    expect(await output.file("ppt/slides/slide1.xml")!.async("string")).toBe(
      await source.file("ppt/slides/slide2.xml")!.async("string"),
    );
  });

  it("increments proposal filenames when a PPTX or its paired PDF already exists", async () => {
    const baseName = "PRIME_Proposal_Client_2026-10-22.pptx";
    await fs.promises.writeFile(path.join(outputDir, baseName), "existing pptx");
    expect(await findAvailableProposalPath(outputDir, baseName)).toBe(
      path.join(outputDir, "PRIME_Proposal_Client_2026-10-22 (1).pptx"),
    );

    await fs.promises.writeFile(path.join(outputDir, "PRIME_Proposal_Client_2026-10-22 (1).pdf"), "existing pdf");
    expect(await findAvailableProposalPath(outputDir, baseName)).toBe(
      path.join(outputDir, "PRIME_Proposal_Client_2026-10-22 (2).pptx"),
    );
  });

  it("reports an empty source folder instead of creating an empty index", async () => {
    const emptyDir = path.join(tempDir, "empty-source");
    await fs.promises.mkdir(emptyDir);

    await expect(scanPropertyDeckFolder(emptyDir, outputDir)).rejects.toThrow(/no .pptx files/i);
  });

  it("rejects a configured source folder that the Mosaic server cannot access", async () => {
    await expect(scanPropertyDeckFolder(
      "Z:\\Users\\PRIME_Dave\\OneDrive - Jet Innovisions\\Sondi Tuazon's files - CRD 2026 COMPILED ONE DRIVE\\Industrial\\Property Deck\\Converted",
      "Z:\\Users\\PRIME_Dave\\OneDrive - Jet Innovisions\\Sondi Tuazon's files - CRD 2026 COMPILED ONE DRIVE\\Industrial\\Property Deck\\Proposals",
    )).rejects.toThrow(/Source folder not found/);
  });
});
