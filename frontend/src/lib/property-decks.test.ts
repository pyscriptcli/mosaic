import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  applySlideOverrides,
  buildCompilationManifest,
  compilePptxInBrowser,
  extractSpecsFromSlideText,
  filterPropertySlides,
  getOrderedSlidePathsFromZip,
  groupPropertySlidesByTitle,
  indexPptxFilesInBrowser,
  parseNumericGla,
  reorderSelectedSlides,
  type PropertySlideItem,
} from "./property-decks";

describe("Property Decks specification extractor", () => {
  it("extracts warehouse location, GLA, ceiling height, and lease rate from slide text", () => {
    const rawText = [
      "CALAMBA LOGISTICS HUB - WAREHOUSE B",
      "Location: Brgy. Real, Calamba, Laguna",
      "Gross Leasable Area (GLA): 4,250 sqm",
      "Clear Ceiling Height: 12 meters (Apex)",
      "Monthly Lease Rate: Php 320 / sqm + VAT",
      "Power Supply: 3-Phase Industrial Power",
      "Loading Bays: 6 Elevated Bays with Dock Levelers",
    ].join("\n");

    const extracted = extractSpecsFromSlideText(rawText, "Laguna Industrial Deck.pptx");

    expect(extracted.slideRole).toBe("property");
    expect(extracted.title).toBe("CALAMBA LOGISTICS HUB - WAREHOUSE B");
    expect(extracted.specs.location).toContain("Laguna");
    expect(extracted.specs.gla).toBe("4,250 sqm");
    expect(extracted.specs.ceilingHeight).toContain("12");
    expect(extracted.specs.leaseRate).toContain("320");
    expect(extracted.specs.powerSupply).toContain("3-Phase");
    expect(extracted.specs.loadingBays).toContain("6 Elevated Bays");
  });

  it("classifies cover and closing slides accurately", () => {
    const cover = extractSpecsFromSlideText(
      "PROPERTY INFORMATION SHEET\nPrepared Exclusively For: DHL Supply Chain\nOctober 2026",
      "Pitch.pptx",
    );
    expect(cover.slideRole).toBe("cover");

    const closing = extractSpecsFromSlideText(
      "THANK YOU\nFOR INQUIRIES PLEASE CONTACT\nPRIME Philippines Industrial Team\nwww.primephilippines.com",
      "Pitch.pptx",
    );
    expect(closing.slideRole).toBe("closing");
  });

  it("parses numeric GLA values from formatted strings", () => {
    expect(parseNumericGla("4,250 sqm")).toBe(4250);
    expect(parseNumericGla("12,000.50 sq.m.")).toBe(12000.5);
    expect(parseNumericGla("TBD")).toBeNull();
  });
});

describe("Property Decks filtering, overrides, and cart sequencing", () => {
  const sampleSlides: PropertySlideItem[] = [
    {
      id: "deck-1:slide:2",
      deckId: "deck-1",
      deckFileName: "Laguna_Warehouses.pptx",
      deckFilePath: "C:/OneDrive/Laguna_Warehouses.pptx",
      slideNumber: 2,
      slideRole: "property",
      title: "Cabuyao Cold Storage & Dry Hub",
      rawText: "Cabuyao, Laguna 3,200 sqm Php 380/sqm",
      thumbnailUrl: "/api/property-decks/thumbnail?id=deck-1:slide:2",
      specs: {
        propertyName: "Cabuyao Cold Storage & Dry Hub",
        location: "Cabuyao, Laguna",
        gla: "3,200 sqm",
        ceilingHeight: "10m",
        leaseRate: "₱380/sqm",
        powerSupply: "3-Phase",
        loadingBays: "4 Bays",
        notes: "",
      },
    },
    {
      id: "deck-2:slide:3",
      deckId: "deck-2",
      deckFileName: "Pasig_Urban_Hubs.pptx",
      deckFilePath: "C:/OneDrive/Pasig_Urban_Hubs.pptx",
      slideNumber: 3,
      slideRole: "property",
      title: "MSCS Pasig Distribution Center",
      rawText: "Mercedes Ave, Pasig City 1,500 sqm Php 450/sqm",
      thumbnailUrl: "/api/property-decks/thumbnail?id=deck-2:slide:3",
      specs: {
        propertyName: "MSCS Pasig Distribution Center",
        location: "Pasig City",
        gla: "1,500 sqm",
        ceilingHeight: "9m",
        leaseRate: "₱450/sqm",
        powerSupply: "3-Phase",
        loadingBays: "2 Bays",
        notes: "",
      },
    },
  ];

  it("merges broker spec overrides over original extracted specs", () => {
    const updated = applySlideOverrides(sampleSlides[0], {
      "deck-1:slide:2": {
        leaseRate: "₱340/sqm (Negotiated)",
        gla: "3,500 sqm",
        notes: "Includes 200 sqm mezzanine office free of charge",
      },
    });

    expect(updated.specs.leaseRate).toBe("₱340/sqm (Negotiated)");
    expect(updated.specs.gla).toBe("3,500 sqm");
    expect(updated.specs.notes).toBe("Includes 200 sqm mezzanine office free of charge");
    expect(updated.specs.location).toBe("Cabuyao, Laguna");
    expect(updated.hasOverrides).toBe(true);
  });

  it("filters slides by location, GLA range, and search query including overridden values", () => {
    const byLocation = filterPropertySlides(sampleSlides, { location: "Pasig" });
    expect(byLocation).toHaveLength(1);
    expect(byLocation[0].id).toBe("deck-2:slide:3");

    const byGla = filterPropertySlides(sampleSlides, { minGla: 2000, maxGla: 5000 });
    expect(byGla).toHaveLength(1);
    expect(byGla[0].id).toBe("deck-1:slide:2");

    const byOverrideNote = filterPropertySlides(
      sampleSlides,
      { query: "mezzanine" },
      { "deck-1:slide:2": { notes: "Includes mezzanine office" } },
    );
    expect(byOverrideNote).toHaveLength(1);
    expect(byOverrideNote[0].id).toBe("deck-1:slide:2");
  });

  it("reorders selected slides in the proposal cart", () => {
    const initial = ["slide-a", "slide-b", "slide-c"];
    expect(reorderSelectedSlides(initial, 0, 2)).toEqual(["slide-b", "slide-c", "slide-a"]);
    expect(reorderSelectedSlides(initial, 2, 0)).toEqual(["slide-c", "slide-a", "slide-b"]);
  });

  it("builds Standard vs Comprehensive deck compilation manifests with distinct sections", () => {
    const overrides = {
      "deck-1:slide:2": { leaseRate: "₱350/sqm" },
    };
    const baseProposal = {
      clientName: "Rhenus Logistics",
      projectTitle: "South Luzon & Metro Manila Expansion",
      brokerName: "Dave P.",
      brokerEmail: "dave@primephilippines.com",
      brokerPhone: "+63 917 000 0000",
      date: "2026-10-21",
    };

    const standardManifest = buildCompilationManifest({
      selectedSlideIds: ["deck-2:slide:3", "deck-1:slide:2"],
      catalogSlides: sampleSlides,
      overrides,
      proposal: { ...baseProposal, mode: "standard" },
    });

    expect(standardManifest.mode).toBe("standard");
    expect(standardManifest.includeSummaryTable).toBe(false);
    expect(standardManifest.includeCredentials).toBe(false);
    expect(standardManifest.slides).toHaveLength(2);
    expect(standardManifest.slides[0].id).toBe("deck-2:slide:3");
    expect(standardManifest.slides[1].specs.leaseRate).toBe("₱350/sqm");

    const comprehensiveManifest = buildCompilationManifest({
      selectedSlideIds: ["deck-2:slide:3", "deck-1:slide:2"],
      catalogSlides: sampleSlides,
      overrides,
      proposal: { ...baseProposal, mode: "comprehensive" },
    });

    expect(comprehensiveManifest.mode).toBe("comprehensive");
    expect(comprehensiveManifest.includeSummaryTable).toBe(true);
    expect(comprehensiveManifest.includeCredentials).toBe(true);
    expect(comprehensiveManifest.comparisonRows).toHaveLength(2);
    expect(comprehensiveManifest.comparisonRows[0]).toMatchObject({
      optionNumber: 1,
      propertyName: "MSCS Pasig Distribution Center",
      location: "Pasig City",
      gla: "1,500 sqm",
      leaseRate: "₱450/sqm",
    });
    expect(comprehensiveManifest.comparisonRows[1]).toMatchObject({
      optionNumber: 2,
      propertyName: "Cabuyao Cold Storage & Dry Hub",
      location: "Cabuyao, Laguna",
      gla: "3,200 sqm",
      leaseRate: "₱350/sqm",
    });
  });

  it("indexes PPTX buffers directly in the browser without requiring server filesystem access", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld><a:p><a:t>PROPERTY INFORMATION SHEET</a:t></a:p><a:p><a:t>Prepared Exclusively For: Nestle</a:t></a:p></p:sld>`,
    );
    zip.file(
      "ppt/slides/slide2.xml",
      `<p:sld><a:p><a:t>CABUYAO LOGISTICS PARK - BLDG 3</a:t></a:p><a:p><a:t>Location: Cabuyao, Laguna</a:t></a:p><a:p><a:t>GLA: 5,400 sqm</a:t></a:p><a:p><a:t>Ceiling Height: 12 meters</a:t></a:p><a:p><a:t>Lease Rate: Php 350 / sqm</a:t></a:p></p:sld>`,
    );
    const buffer = await zip.generateAsync({ type: "arraybuffer" });

    const catalog = await indexPptxFilesInBrowser(
      [
        {
          name: "Laguna_Industrial_2026.pptx",
          relativePath: "Converted/Laguna_Industrial_2026.pptx",
          data: buffer,
        },
      ],
      "C:\\Users\\PRIME_Dave\\OneDrive - Jet Innovisions\\Converted",
    );

    expect(catalog.decksCount).toBe(1);
    expect(catalog.slides).toHaveLength(2);
    expect(catalog.slides[0].slideRole).toBe("cover");
    expect(catalog.slides[1].slideRole).toBe("property");
    expect(catalog.slides[1].specs.location).toContain("Laguna");
    expect(catalog.slides[1].specs.gla).toBe("5,400 sqm");
    expect(catalog.slides[1].thumbnailUrl).toMatch(/^data:image\//);
  });

  it("compiles a complete OpenXML PPTX archive directly in the browser", async () => {
    const manifest = buildCompilationManifest({
      selectedSlideIds: ["deck-1:slide:2", "deck-2:slide:3"],
      catalogSlides: sampleSlides,
      overrides: {
        "deck-1:slide:2": { leaseRate: "₱345/sqm (Final)" },
      },
      proposal: {
        clientName: "Shopee Express",
        projectTitle: "Luzon Fulfillment Hubs",
        brokerName: "Dave P.",
        brokerEmail: "dave@primephilippines.com",
        brokerPhone: "+63 917 000 0000",
        date: "2026-10-21",
        mode: "comprehensive",
      },
    });

    const compiled = await compilePptxInBrowser(manifest);
    expect(compiled.fileName).toBe("PRIME_Proposal_Shopee_Express_Comprehensive_2026-10-21.pptx");
    expect(compiled.slideCount).toBe(6);

    const loadedZip = await JSZip.loadAsync(compiled.buffer);
    expect(loadedZip.file("[Content_Types].xml")).not.toBeNull();
    expect(loadedZip.file("_rels/.rels")).not.toBeNull();
    expect(loadedZip.file("ppt/presentation.xml")).not.toBeNull();
    expect(loadedZip.file("ppt/slides/slide1.xml")).not.toBeNull();
    expect(loadedZip.file("ppt/slides/slide6.xml")).not.toBeNull();

    const slide3Xml = await loadedZip.file("ppt/slides/slide3.xml")!.async("string");
    expect(slide3Xml).toContain("Cabuyao Cold Storage");
    expect(slide3Xml).toContain("345/sqm (Final)");
  });

  it("reads active slide order from presentation.xml and skips orphan deleted slides", async () => {
    const zip = new JSZip();
    zip.file(
      "ppt/presentation.xml",
      `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="273" r:id="rId10"/></p:sldIdLst></p:presentation>`,
    );
    zip.file(
      "ppt/_rels/presentation.xml.rels",
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId7" Target="slides/slide6.xml"/><Relationship Id="rId10" Target="slides/slide9.xml"/></Relationships>`,
    );
    zip.file("ppt/slides/slide1.xml", "<p:sld><a:t>Active Slide 1</a:t></p:sld>");
    zip.file("ppt/slides/slide6.xml", "<p:sld><a:t>Orphan Deleted Slide 6</a:t></p:sld>");
    zip.file("ppt/slides/slide9.xml", "<p:sld><a:t>Active Slide 9</a:t></p:sld>");

    const ordered = await getOrderedSlidePathsFromZip(zip);
    expect(ordered).toEqual(["ppt/slides/slide1.xml", "ppt/slides/slide9.xml"]);
  });

  it("groups slides sharing the same warehouse title into a single collapsed group", () => {
    const multiSlides: PropertySlideItem[] = [
      {
        id: "deck-bataan:slide:3",
        deckId: "deck-bataan",
        deckFileName: "PRIME_IW_Bataan - UPDATED.pptx",
        deckFilePath: "C:/OneDrive/PRIME_IW_Bataan - UPDATED.pptx",
        slideNumber: 3,
        slideRole: "property",
        title: "Bataan Warehouse Space — Lease Terms & Units",
        rawText: "Hermosa Ecozone Industrial Park Php 250/sqm 5,856 sqm",
        thumbnailUrl: "/property-decks/previews/prime_iw_bataan_s3.jpg",
        specs: {
          propertyName: "Bataan Warehouse Space",
          location: "Hermosa, Bataan",
          gla: "5,856 sqm",
          ceilingHeight: "9m",
          leaseRate: "Php 250.00/sqm",
          powerSupply: "Three-Phase",
          loadingBays: "Yes",
          notes: "",
        },
      },
      {
        id: "deck-bataan:slide:4",
        deckId: "deck-bataan",
        deckFileName: "PRIME_IW_Bataan - UPDATED.pptx",
        deckFilePath: "C:/OneDrive/PRIME_IW_Bataan - UPDATED.pptx",
        slideNumber: 4,
        slideRole: "property",
        title: "Bataan Warehouse Space — Specifications & Access",
        rawText: "Shoulder Height 9m Apex 10m Loading Bay Yes",
        thumbnailUrl: "/property-decks/previews/prime_iw_bataan_s4.jpg",
        specs: {
          propertyName: "Bataan Warehouse Space",
          location: "Hermosa, Bataan",
          gla: "5,856 sqm",
          ceilingHeight: "9m",
          leaseRate: "Php 250.00/sqm",
          powerSupply: "Three-Phase",
          loadingBays: "Yes",
          notes: "",
        },
      },
      {
        id: "deck-bataan:slide:5",
        deckId: "deck-bataan",
        deckFileName: "PRIME_IW_Bataan - UPDATED.pptx",
        deckFilePath: "C:/OneDrive/PRIME_IW_Bataan - UPDATED.pptx",
        slideNumber: 5,
        slideRole: "property",
        title: "Bataan Warehouse Space — Photos & Site Plan",
        rawText: "Property Photos",
        thumbnailUrl: "/property-decks/previews/prime_iw_bataan_s5.jpg",
        specs: {
          propertyName: "Bataan Warehouse Space",
          location: "Hermosa, Bataan",
          gla: "5,856 sqm",
          ceilingHeight: "9m",
          leaseRate: "Php 250.00/sqm",
          powerSupply: "Three-Phase",
          loadingBays: "Yes",
          notes: "",
        },
      },
    ];

    const groups = groupPropertySlidesByTitle(multiSlides);
    expect(groups).toHaveLength(1);
    expect(groups[0].title).toBe("Bataan Warehouse Space");
    expect(groups[0].slides).toHaveLength(3);
    expect(groups[0].leadSlide.id).toBe("deck-bataan:slide:3");
  });
});
