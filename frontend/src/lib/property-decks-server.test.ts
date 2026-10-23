import fs from "node:fs";
import { execFile as nodeExecFile } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileCopiedPptx } from "./property-deck-export";
import { buildCompilationManifest, extractTextFromSlideXml, getOrderedSlidePathsFromZip } from "./property-decks";
import { compilePropertyDeck, convertPropertyDeckPdf, findAvailableProposalPath, scanPropertyDeckFolder } from "./property-decks-server";

const execFile = promisify(nodeExecFile);

async function createSamplePptx(filePath: string, slidesXml: string[]) {
  const zip = new JSZip();
  slidesXml.forEach((xml, idx) => {
    const rootAttributes = xml.match(/<p:sld\b([^>]*)>/i)?.[1] || 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    const runs = [...xml.matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/gi)].map((match, index) =>
      `<p:sp><p:nvSpPr><p:cNvPr id="${index + 2}" name="Text ${index + 1}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>${match[1]}</a:t></a:r></a:p></p:txBody></p:sp>`,
    ).join("");
    const slideXml = `<p:sld${rootAttributes}><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${runs}</p:spTree></p:cSld></p:sld>`;
    zip.file(`ppt/slides/slide${idx + 1}.xml`, slideXml);
  });
  const slideIds = slidesXml.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
  const relationships = slidesXml
    .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`)
    .join("");
  const slideOverrides = slidesXml
    .map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
    .join("");
  zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>${slideOverrides}</Types>`);
  zip.file("_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationships}</Relationships>`);
  slidesXml.forEach((_, index) => zip.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`, `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`));
  zip.file("ppt/slideLayouts/slideLayout1.xml", `<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree/></p:cSld></p:sldLayout>`);
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

  it("copies only the selected source slide to the output folder", async () => {
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
    }, { platform: "linux" });

    expect(fs.existsSync(compiled.outputPath)).toBe(true);
    expect(compiled.fileName).toMatch(/Kuehne_Nagel/i);
    expect(compiled.slideCount).toBe(3);
    const output = await JSZip.loadAsync(await fs.promises.readFile(compiled.outputPath));
    const exportedCover = await output.file("ppt/slides/slide1.xml")!.async("string");
    const exportedSlide = await output.file("ppt/slides/slide2.xml")!.async("string");
    const exportedCta = await output.file("ppt/slides/slide3.xml")!.async("string");
    expect(exportedCover).toContain("Prepared Exclusively For: Client");
    expect(exportedSlide).toContain("STA. ROSA LOGISTICS PARK - BUILDING A");
    expect(exportedSlide).toContain("Sta. Rosa");
    expect(exportedSlide).not.toContain("Sta. Rosa, Laguna");
    expect(exportedCta).toContain("Mosaic Proposal CTA");
  });

  it("exports one client cover, the facility divider, selected property, and one generated contact CTA", async () => {
    const deckPath = path.join(sourceDir, "Antipolo_Options.pptx");
    await createSamplePptx(deckPath, [
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:p><a:r><a:t>PROPERTY DECK PRESENTATION</a:t></a:r></a:p><a:p><a:r><a:t>[ Client Representative / Contact Name ]</a:t></a:r></a:p></p:sld>`,
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:p><a:r><a:t>2. Industrial Facility Proposal</a:t></a:r></a:p><a:p><a:r><a:t>Antipolo</a:t></a:r></a:p><a:p><a:r><a:t>Upon Request</a:t></a:r></a:p></p:sld>`,
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:p><a:r><a:t>ANTIPOLO WAREHOUSE</a:t></a:r></a:p><a:p><a:r><a:t>4,200 sqm</a:t></a:r></a:p><a:p><a:r><a:t>Php 350/sqm</a:t></a:r></a:p></p:sld>`,
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:p><a:r><a:t>For more information and to schedule a viewing, contact us</a:t></a:r></a:p></p:sld>`,
    ]);

    const catalog = await scanPropertyDeckFolder(sourceDir, outputDir);
    const property = catalog.slides.find((slide) => slide.title === "ANTIPOLO WAREHOUSE");
    expect(property).toBeDefined();
    const manifest = buildCompilationManifest({
      selectedSlideIds: [property!.id],
      catalogSlides: catalog.slides,
      proposal: {
        clientName: "FastCargo Logistics",
        clientDesignation: "Supply Chain Director",
        clientCompany: "FastCargo Inc.",
        preparedByName: "Sondi Tuazon",
        preparedByDesignation: "Sr. Head",
        preparedByCompany: "PRIME Philippines",
        projectTitle: "",
        brokerName: "",
        brokerEmail: "",
        brokerPhone: "",
        date: "2026-10-22",
        mode: "standard",
        ctaContacts: [{ id: "sondi", name: "Sondi Tuazon", title: "Sr. Head", phone: "+63 917 845 6128", email: "sondi@primephilippines.com" }],
      },
    });
    const compiled = await compilePropertyDeck({ manifest, outputFolder: outputDir }, { platform: "linux" });
    const output = await JSZip.loadAsync(await fs.promises.readFile(compiled.outputPath));
    const orderedSlides = await getOrderedSlidePathsFromZip(output);
    const slideText = await Promise.all(orderedSlides.map(async (slidePath) => extractTextFromSlideXml(await output.file(slidePath)!.async("string"))));

    expect(compiled.engine).toBe("openxml-slide-copy");
    expect(slideText).toHaveLength(4);
    expect(slideText[0]).toContain("FastCargo Logistics");
    expect(slideText[1]).toContain("2. Industrial Facility Proposal");
    expect(slideText[1]).toContain("Antipolo");
    expect(slideText[2]).toContain("ANTIPOLO WAREHOUSE");
    expect(slideText[3]).toContain("schedule a viewing");
    expect(slideText[3]).toContain("Sondi Tuazon");
    expect(slideText[3]).toContain("sondi@primephilippines.com");
    expect(compiled.slideCount).toBe(4);
    const outputSlideXml = await Promise.all(orderedSlides.map(async (slidePath) => output.file(slidePath)!.async("string")));
    expect(outputSlideXml.filter((xml) => xml.includes('name="Mosaic Proposal Cover"'))).toHaveLength(1);
    expect(outputSlideXml.filter((xml) => xml.includes('name="Mosaic Proposal CTA"'))).toHaveLength(1);

    let nativeAssemblyCalled = false;
    const nativeCompiled = await compilePropertyDeck({ manifest, outputFolder: outputDir }, {
      platform: "win32",
      assembleWithPowerPoint: async (nativeManifest, outputPath) => {
        nativeAssemblyCalled = true;
        expect(nativeManifest.proposal.ctaContacts).toEqual(manifest.proposal.ctaContacts);
        const nativeSources = new Map<string, { name: string; relativePath: string; data: Buffer }>();
        for (const slide of nativeManifest.slides) {
          if (nativeSources.has(slide.deckFilePath)) continue;
          nativeSources.set(slide.deckFilePath, {
            name: slide.deckFileName,
            relativePath: slide.deckFilePath,
            data: await fs.promises.readFile(slide.deckFilePath),
          });
        }
        const pptx = await compileCopiedPptx(nativeManifest, nativeSources);
        await fs.promises.writeFile(outputPath, pptx.buffer);
      },
      compileOpenXml: async () => {
        throw new Error("Windows exports must use Microsoft PowerPoint assembly.");
      },
    });
    expect(nativeAssemblyCalled).toBe(true);
    expect(nativeCompiled.engine).toBe("microsoft-powerpoint");
    expect(nativeCompiled.slideCount).toBe(4);
    const nativeZip = await JSZip.loadAsync(await fs.promises.readFile(nativeCompiled.outputPath));
    const nativeSlides = await getOrderedSlidePathsFromZip(nativeZip);
    const nativeXml = await Promise.all(nativeSlides.map(async (slidePath) => nativeZip.file(slidePath)!.async("string")));
    expect(nativeXml.filter((xml) => xml.includes('name="Mosaic Proposal Cover"'))).toHaveLength(1);
    expect(nativeXml.filter((xml) => xml.includes('name="Mosaic Proposal CTA"'))).toHaveLength(1);
  });

  it.runIf(process.env.MOSAIC_RUN_NATIVE_POWERPOINT === "1")(
    "assembles and reopens a real PowerPoint export with a generated cover logo and CTA",
    async () => {
      const logoDeckPath = path.join(sourceDir, "Logo_Fallback_Test.pptx");
      const fixtureScriptPath = path.join(tempDir, "create-powerpoint-fixture.ps1");
      await fs.promises.writeFile(fixtureScriptPath, [
        "param([string]$OutputPath)",
        "$ErrorActionPreference = 'Stop'",
        "$powerPoint = New-Object -ComObject PowerPoint.Application",
        "$presentation = $powerPoint.Presentations.Add()",
        "$slide = $presentation.Slides.Add(1, 12)",
        "$title = $slide.Shapes.AddTextbox(1, 80, 80, 800, 80)",
        "$title.TextFrame.TextRange.Text = 'Logo fallback test warehouse'",
        "$location = $slide.Shapes.AddTextbox(1, 80, 180, 800, 60)",
        "$location.TextFrame.TextRange.Text = 'Antipolo'",
        "$presentation.SaveAs($OutputPath, 24)",
        "$presentation.Close()",
        "$powerPoint.Quit()",
      ].join("\r\n"), "utf8");
      await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", fixtureScriptPath, logoDeckPath]);
      const catalog = await scanPropertyDeckFolder(sourceDir, outputDir);
      const property = catalog.slides.find((slide) => slide.deckFilePath === logoDeckPath && slide.slideRole === "property");
      expect(property).toBeDefined();
      const manifest = buildCompilationManifest({
        selectedSlideIds: [property!.id],
        catalogSlides: catalog.slides,
        proposal: {
          clientName: "Logo Fallback Test Client",
          clientDesignation: "Operations Director",
          clientCompany: "Test Logistics Inc.",
          clientLogoDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ZsAAAAASUVORK5CYII=",
          preparedByName: "Sondi Tuazon",
          preparedByDesignation: "Sr. Head",
          preparedByCompany: "PRIME Philippines",
          projectTitle: "Logo Fit Verification",
          brokerName: "",
          brokerEmail: "",
          brokerPhone: "",
          date: "2026-10-23",
          mode: "standard",
        },
      });
      expect(manifest.generatedCover).toBe(true);
      const compiled = await compilePropertyDeck({ manifest, outputFolder: outputDir }, { platform: "win32" });
      expect(compiled.engine).toBe("microsoft-powerpoint");
      expect(compiled.slideCount).toBe(3);
      const output = await JSZip.loadAsync(await fs.promises.readFile(compiled.outputPath));
      const orderedSlides = await getOrderedSlidePathsFromZip(output);
      const slideXmls = await Promise.all(orderedSlides.map(async (slidePath) => output.file(slidePath)!.async("string")));
      expect(slideXmls.filter((xml) => xml.includes('name="Mosaic Proposal Cover"'))).toHaveLength(1);
      expect(slideXmls.filter((xml) => xml.includes('name="Mosaic Proposal CTA"'))).toHaveLength(1);
      expect(slideXmls[0]).toContain("Logo Fallback Test Client");
      expect(Object.keys(output.files).some((filePath) => filePath.startsWith("ppt/media/") && filePath.endsWith(".png"))).toBe(true);

      const converted = await convertPropertyDeckPdf(compiled.outputPath);
      const pdfBytes = new Uint8Array(await fs.promises.readFile(converted.pdfPath));
      const pdfLoadingTask = getDocument({ data: pdfBytes });
      const pdfDocument = await pdfLoadingTask.promise;
      expect(pdfDocument.numPages).toBe(3);
      const firstPageText = await pdfDocument.getPage(1).then((page) => page.getTextContent());
      const lastPageText = await pdfDocument.getPage(3).then((page) => page.getTextContent());
      expect(firstPageText.items.map((item) => "str" in item ? item.str : "").join(" ")).toContain("Logo Fallback Test Client");
      expect(lastPageText.items.map((item) => "str" in item ? item.str : "").join(" ")).toContain("schedule a viewing");
      await pdfLoadingTask.destroy();
    },
    60_000,
  );

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
