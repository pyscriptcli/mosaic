import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { rankDemandMatches } from "./property-deck-demand-matching";
import { compileCopiedPptx } from "./property-deck-export";
import {
  applySlideOverrides,
  buildCompilationManifest,
  extractSpecsFromSlideText,
  extractTextFromSlideXml,
  filterPropertySlides,
  groupPropertyLocationsByCity,
  getOrderedSlidePathsFromZip,
  groupPropertySlidesByTitle,
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

describe("Property Decks demand matching", () => {
  const slides: PropertySlideItem[] = [
    {
      id: "demand-pasig",
      deckId: "demand-pasig",
      deckFileName: "Pasig.pptx",
      deckFilePath: "C:/OneDrive/Pasig.pptx",
      slideNumber: 1,
      slideRole: "property",
      title: "Pasig Distribution Hub",
      rawText: "Pasig City 2,100 sqm 10m Php 420/sqm 3-Phase Loading Bays 3 Truck access near port",
      thumbnailUrl: "",
      specs: { propertyName: "Pasig Distribution Hub", location: "Pasig City", gla: "2,100 sqm", ceilingHeight: "10m", leaseRate: "Php 420/sqm", powerSupply: "3-Phase", loadingBays: "3 Bays", notes: "Truck access" },
    },
    {
      id: "demand-binan",
      deckId: "demand-binan",
      deckFileName: "Biñan.pptx",
      deckFilePath: "C:/OneDrive/Biñan.pptx",
      slideNumber: 1,
      slideRole: "property",
      title: "Biñan Logistics Center",
      rawText: "Biñan, Laguna 4,800 sqm 12m Php 360/sqm 3-phase 6 loading bays; near port",
      thumbnailUrl: "",
      specs: { propertyName: "Biñan Logistics Center", location: "Biñan, Laguna", gla: "4,800 sqm", ceilingHeight: "12m", leaseRate: "Php 360/sqm", powerSupply: "3-phase", loadingBays: "6 loading bays", notes: "Near port" },
    },
  ];

  it("ranks exact matches ahead of partial matches and explains every requested criterion", () => {
    const matches = rankDemandMatches(slides, {
      locations: ["Pasig"],
      minGla: "2,000",
      maxGla: "2,500",
      minLeaseRate: "350",
      maxLeaseRate: "450",
      minClearHeight: "9",
      powerSupplies: ["three-phase"],
      requiresLoadingDock: true,
      requiresTruckAccess: true,
      otherRequirements: "near port",
    });

    expect(matches.map((match) => match.property.id)).toEqual(["demand-pasig", "demand-binan"]);
    expect(matches[0]).toMatchObject({ matchKind: "exact", matchedCount: 8, requirementCount: 8 });
    expect(matches[0].criteria.find((criterion) => criterion.label === "Truck access")?.matched).toBe(true);
    expect(matches[0].criteria.find((criterion) => criterion.label === "Other requirements")?.matched).toBe(true);
    expect(matches[1]).toMatchObject({ matchKind: "partial", matchedCount: 5, requirementCount: 8 });
    expect(matches[1].criteria.find((criterion) => criterion.label === "Other requirements")?.evidence).toContain("port");
  });

  it("returns no ranked properties when requirements are not met and accepts either requested power phase", () => {
    const phaseMatches = rankDemandMatches(slides, {
      locations: [],
      minGla: "",
      maxGla: "",
      minLeaseRate: "",
      maxLeaseRate: "",
      minClearHeight: "",
      powerSupplies: ["three-phase", "single-phase"],
      requiresLoadingDock: false,
      requiresTruckAccess: false,
      otherRequirements: "",
    });
    expect(phaseMatches.map((match) => match.property.id)).toEqual(["demand-binan", "demand-pasig"]);

    const matches = rankDemandMatches(slides, {
      locations: ["Cebu"],
      minGla: "20,000",
      maxGla: "",
      minLeaseRate: "",
      maxLeaseRate: "",
      minClearHeight: "",
      powerSupplies: ["single-phase"],
      requiresLoadingDock: false,
      requiresTruckAccess: false,
      otherRequirements: "",
    });

    expect(matches).toHaveLength(0);
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

  it("groups distinct location filters under their city", () => {
    expect(groupPropertyLocationsByCity([
      "Pasig City",
      "Sandoval Ave., Pasig City",
      "Biñan, Laguna",
      "Hermosa Ecozone Industrial Park",
    ])).toEqual([
      { city: "Biñan", locations: ["Biñan, Laguna"] },
      { city: "Hermosa", locations: ["Hermosa Ecozone Industrial Park"] },
      { city: "Pasig", locations: ["Pasig City", "Sandoval Ave., Pasig City"] },
    ]);
  });

  it("adds one location-specific Industrial Facility Proposal page and CTA per selected deck", () => {
    const deckSlides: PropertySlideItem[] = [
      {
        ...sampleSlides[1],
        id: "deck-pasig:slide:1",
        slideNumber: 1,
        slideRole: "cover",
        title: "Client Proposal Cover",
        rawText: "Prepared for client",
      },
      {
        ...sampleSlides[1],
        id: "deck-pasig:slide:2",
        slideNumber: 2,
        slideRole: "cover",
        title: "Industrial Facility Proposal",
        rawText: "Industrial Facility Proposal\\nPasig City",
      },
      sampleSlides[1],
      {
        ...sampleSlides[1],
        id: "deck-pasig:slide:4",
        slideNumber: 4,
        slideRole: "closing",
        title: "Contact PRIME to schedule a viewing",
        rawText: "For inquiries, contact us",
      },
    ];

    const manifest = buildCompilationManifest({
      selectedSlideIds: [sampleSlides[1].id],
      catalogSlides: deckSlides,
      proposal: {
        clientName: "Client",
        projectTitle: "",
        brokerName: "",
        brokerEmail: "",
        brokerPhone: "",
        date: "2026-10-22",
        mode: "standard",
      },
    });

    expect(manifest.slides.map((slide) => slide.id)).toEqual([
      "deck-pasig:slide:1",
      "deck-pasig:slide:2",
      sampleSlides[1].id,
      "deck-pasig:slide:4",
    ]);
  });

  it("exports the client cover, included facility divider, selected property, source CTA, and contact CTA together", async () => {
    const deckPath = "C:/OneDrive/Antipolo_Options.pptx";
    const deckName = "Antipolo_Options.pptx";
    const slideTexts = [
      "Client Proposal Cover",
      "2. Industrial Facility Proposal\nAntipolo\nUpon Request\nUpon Request",
      "Antipolo Warehouse\n4,200 sqm\nPhp 350/sqm",
      "For more information and to schedule a viewing, contact us",
    ];
    const source = new JSZip();
    const slideOverrides = slideTexts.map((_, index) => `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
    const slideIds = slideTexts.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
    const slideRels = slideTexts.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`).join("");
    source.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slideOverrides}<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/></Types>`);
    source.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`);
    source.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slideRels}</Relationships>`);
    slideTexts.forEach((text, index) => {
      const paragraphs = text.split("\n").map((line) => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`).join("");
      source.file(`ppt/slides/slide${index + 1}.xml`, `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody>${paragraphs}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`);
      source.file(`ppt/slides/_rels/slide${index + 1}.xml.rels`, '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>');
    });
    source.file("ppt/slideLayouts/slideLayout1.xml", '<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree/></p:cSld></p:sldLayout>');

    const deckSlides: PropertySlideItem[] = slideTexts.map((text, index) => ({
      ...sampleSlides[0],
      id: `antipolo-deck:slide:${index + 1}`,
      deckId: "antipolo-deck",
      deckFileName: deckName,
      deckFilePath: deckPath,
      slideNumber: index + 1,
      slideRole: index === 0 || index === 1 ? "cover" : index === 2 ? "property" : "closing",
      title: index === 0 ? "Client Proposal Cover" : index === 1 ? "2. Industrial Facility Proposal" : index === 2 ? "Antipolo Warehouse" : "Contact us",
      rawText: text,
      specs: { ...sampleSlides[0].specs, propertyName: "Antipolo Warehouse", location: "Antipolo", gla: "4,200 sqm", leaseRate: "Php 350/sqm" },
    }));
    const manifest = buildCompilationManifest({
      selectedSlideIds: ["antipolo-deck:slide:3"],
      catalogSlides: deckSlides,
      proposal: {
        clientName: "Client", projectTitle: "", brokerName: "", brokerEmail: "", brokerPhone: "", date: "2026-10-22", mode: "standard",
        ctaContacts: [{ id: "sondi", name: "Sondi Tuazon", title: "Sr. Head", phone: "+63 917 845 6128", email: "sondi@primephilippines.com" }],
      },
    });
    const compiled = await compileCopiedPptx(manifest, new Map([[deckPath, { name: deckName, relativePath: deckName, data: await source.generateAsync({ type: "uint8array" }) }]]));
    const output = await JSZip.loadAsync(compiled.buffer);
    const orderedSlides = await getOrderedSlidePathsFromZip(output);
    const exportedText = await Promise.all(orderedSlides.map(async (slidePath) => extractTextFromSlideXml(await output.file(slidePath)!.async("string"))));

    expect(exportedText).toHaveLength(5);
    expect(exportedText[0]).toContain("Client Proposal Cover");
    expect(exportedText[1]).toContain("2. Industrial Facility Proposal");
    expect(exportedText[1]).toContain("Antipolo");
    expect(exportedText[2]).toContain("Antipolo Warehouse");
    expect(exportedText[3]).toContain("schedule a viewing");
    expect(exportedText[4]).toContain("Sondi Tuazon");
    expect(exportedText[4]).toContain("sondi@primephilippines.com");
    expect(compiled.slideCount).toBe(5);
  });

  it("uses the selected property's location on its Industrial Facility Proposal slide", () => {
    const property = {
      ...sampleSlides[1],
      id: "paranaque:property:1",
      deckId: "paranaque-deck",
      slideRole: "property" as const,
      specs: { ...sampleSlides[1].specs, location: "Sucat, Parañaque City" },
    };
    const divider = {
      ...property,
      id: "paranaque:divider:1",
      slideNumber: 2,
      slideRole: "cover" as const,
      title: "Industrial Facility Proposal",
      rawText: "Industrial Facility Proposal\nPasig City",
      specs: { ...property.specs, location: "Pasig City" },
    };

    const manifest = buildCompilationManifest({
      selectedSlideIds: [property.id],
      catalogSlides: [divider, property],
      proposal: {
        clientName: "Client",
        projectTitle: "",
        brokerName: "",
        brokerEmail: "",
        brokerPhone: "",
        date: "2026-10-22",
        mode: "standard",
      },
    });

    expect(manifest.slides[0].id).toBe(divider.id);
    expect(manifest.slides[0].proposalLocation).toBe("Parañaque");
  });

  it("personalizes the proposal cover and places an uploaded client logo in its cover logo slot", async () => {
    const source = new JSZip();
    source.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/></Types>');
    source.file("ppt/presentation.xml", '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
    source.file("ppt/_rels/presentation.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
    source.file("ppt/slides/slide1.xml", '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:sp><p:nvSpPr><p:cNvPr id="8" name="Client logo slot"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="10" y="20"/><a:ext cx="300" cy="160"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:p><a:r><a:t>[ INSERT CLIENT LOGO OR PROJECT TITLE ]</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:nvSpPr><p:cNvPr id="9" name="Client name"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:p><a:r><a:t>[ Client Representative / Contact Name ]</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>[ Broker Name(s) / Lead Advisor ]</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
    source.file("ppt/slides/_rels/slide1.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>');
    source.file("ppt/slideLayouts/slideLayout1.xml", '<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree/></p:cSld></p:sldLayout>');
    const slide: PropertySlideItem = {
      ...sampleSlides[0],
      id: "cover-deck:slide:1",
      deckId: "cover-deck",
      deckFileName: "Cover_Deck.pptx",
      deckFilePath: "C:/OneDrive/Cover_Deck.pptx",
      slideNumber: 1,
      slideRole: "cover",
      title: "Client Proposal Cover",
      rawText: "Prepared for client",
    };
    const logoData = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=";
    const manifest = {
      mode: "standard" as const,
      proposal: {
        clientName: "Charlene Magnaye",
        clientDesignation: "Business Development",
        clientCompany: "MSCS PrimeGoods Inc.",
        preparedByName: "Cedtrix Rena",
        preparedByDesignation: "Sr. Leasing Advisor",
        preparedByCompany: "PRIME Philippines",
        clientLogoDataUrl: logoData,
        ctaContacts: [{ id: "sondi", name: "Sondi Tuazon", title: "Sr. Head · Retail and Industrial Markets", phone: "+63 917 845 6128", email: "sondi.tuazon@primephilippines.com", photoDataUrl: logoData }],
        projectTitle: "",
        brokerName: "",
        brokerEmail: "",
        brokerPhone: "",
        date: "2026-10-22",
        mode: "standard" as const,
      },
      includeSummaryTable: false,
      includeCredentials: false,
      slides: [slide],
      comparisonRows: [],
    };

    const compiled = await compileCopiedPptx(manifest, new Map([[slide.deckFilePath, {
      name: slide.deckFileName,
      relativePath: slide.deckFilePath,
      data: await source.generateAsync({ type: "uint8array" }),
    }]]));
    const output = await JSZip.loadAsync(compiled.buffer);
    const coverXml = await output.file("ppt/slides/slide1.xml")!.async("string");
    const logoRelXml = await output.file("ppt/slides/_rels/slide1.xml.rels")!.async("string");

    expect(coverXml).toContain("Charlene Magnaye");
    expect(coverXml).toContain("Cedtrix Rena");
    expect(coverXml).not.toContain("Broker Name(s)");
    expect(coverXml).not.toContain("INSERT CLIENT LOGO");
    expect(coverXml).toContain('r:embed="rId1"');
    expect(logoRelXml).toContain('Type="http://schemas.openxmlformats.org/package/2006/relationships/image"');
    expect(output.file("ppt/slides/assets/client-logo.png")).not.toBeNull();
    const contactXml = await output.file("ppt/slides/slide2.xml")!.async("string");
    expect(contactXml).toContain("Sondi Tuazon");
    expect(contactXml).toContain("Sr. Head · Retail and Industrial Markets");
    expect(contactXml).toContain("sondi.tuazon@primephilippines.com");
    expect(contactXml).toContain("+63 917 845 6128");
    expect(contactXml).toContain("a:srcRect");
    expect(output.file("ppt/media/proposal-contact-1.png")).not.toBeNull();
  });

  it("exports the selected location on an Industrial Facility Proposal divider", async () => {
    const source = new JSZip();
    source.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
    source.file("ppt/presentation.xml", '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
    source.file("ppt/_rels/presentation.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
    source.file("ppt/slides/slide1.xml", '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Industrial Facility Proposal</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>Pasig City</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
    const divider: PropertySlideItem = {
      ...sampleSlides[1],
      id: "paranaque:divider:1",
      deckId: "paranaque-deck",
      deckFileName: "Paranaque_Deck.pptx",
      deckFilePath: "C:/OneDrive/Paranaque_Deck.pptx",
      slideNumber: 1,
      slideRole: "cover",
      title: "Industrial Facility Proposal",
      rawText: "Industrial Facility Proposal\nPasig City",
      proposalLocation: "Parañaque",
      specs: { ...sampleSlides[1].specs, location: "Pasig City" },
    };
    const compiled = await compileCopiedPptx({
      mode: "standard",
      proposal: { clientName: "Client", projectTitle: "", brokerName: "", brokerEmail: "", brokerPhone: "", date: "2026-10-22", mode: "standard" },
      includeSummaryTable: false,
      includeCredentials: false,
      slides: [divider],
      comparisonRows: [],
    }, new Map([[divider.deckFilePath, {
      name: divider.deckFileName,
      relativePath: divider.deckFilePath,
      data: await source.generateAsync({ type: "uint8array" }),
    }]]));
    const output = await JSZip.loadAsync(compiled.buffer);
    const slideXml = await output.file("ppt/slides/slide1.xml")!.async("string");

    expect(slideXml).toContain("Parañaque");
    expect(slideXml).not.toContain("Pasig City");
  });

  it("writes only the city name into exported property slides", async () => {
    const source = new JSZip();
    source.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/></Types>');
    source.file("ppt/presentation.xml", '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>');
    source.file("ppt/_rels/presentation.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>');
    source.file("ppt/slides/_rels/slide1.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>');
    source.file("ppt/slideLayouts/slideLayout1.xml", '<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank"><p:cSld name="Blank"><p:spTree/></p:cSld></p:sldLayout>');
    source.file("ppt/slides/slide1.xml", '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>Sandoval Ave., Pasig City</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>');
    const property: PropertySlideItem = {
      ...sampleSlides[1],
      slideRole: "property",
      slideNumber: 1,
      deckFileName: "Pasig_Deck.pptx",
      deckFilePath: "C:/OneDrive/Pasig_Deck.pptx",
      sourceLocation: "Sandoval Ave., Pasig City",
      specs: { ...sampleSlides[1].specs, location: "Pasig" },
    };
    const manifest = {
      mode: "standard" as const,
      proposal: { clientName: "Client", projectTitle: "", brokerName: "", brokerEmail: "", brokerPhone: "", date: "2026-10-22", mode: "standard" as const },
      includeSummaryTable: false,
      includeCredentials: false,
      slides: [property],
      comparisonRows: [],
    };
    const compiled = await compileCopiedPptx(manifest, new Map([[property.deckFilePath, { name: property.deckFileName, relativePath: property.deckFilePath, data: await source.generateAsync({ type: "uint8array" }) }]]));
    const output = await JSZip.loadAsync(compiled.buffer);
    const slideXml = await output.file("ppt/slides/slide1.xml")!.async("string");
    expect(slideXml).toContain("Pasig");
    expect(slideXml).not.toContain("Sandoval Ave.");
    expect(slideXml).not.toContain("Pasig City");
  });

  it("keeps proposal slide locations to city names and preserves their source location for export rewriting", () => {
    const manifest = buildCompilationManifest({
      selectedSlideIds: [sampleSlides[0].id],
      catalogSlides: sampleSlides,
      proposal: { clientName: "Client", projectTitle: "", brokerName: "", brokerEmail: "", brokerPhone: "", date: "2026-10-22", mode: "standard" },
    });
    const property = manifest.slides.find((slide) => slide.id === sampleSlides[0].id);
    expect(property?.specs.location).toBe("Cabuyao");
    expect(property?.sourceLocation).toBe("Cabuyao, Laguna");
  });

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
      location: "Pasig",
      gla: "1,500 sqm",
      leaseRate: "₱450/sqm",
    });
    expect(comprehensiveManifest.comparisonRows[1]).toMatchObject({
      optionNumber: 2,
      propertyName: "Cabuyao Cold Storage & Dry Hub",
      location: "Cabuyao",
      gla: "3,200 sqm",
      leaseRate: "₱350/sqm",
    });
  });

  it("exports exact selected source slides in cart order", async () => {
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

    const makeSourceDeck = async (fileName: string, selectedNumber: number, originalSlide: string) => {
      const source = new JSZip();
      const slidePaths = Array.from({ length: selectedNumber }, (_, index) => `ppt/slides/slide${index + 1}.xml`);
      slidePaths.forEach((slidePath, index) => {
        source.file(slidePath, index + 1 === selectedNumber ? originalSlide : `<p:sld>unused ${index + 1}</p:sld>`);
      });
      const slideOverrides = slidePaths
        .map((slidePath) => `<Override PartName="/${slidePath}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`)
        .join("");
      const slideIds = slidePaths.map((_, index) => `<p:sldId id="${256 + index}" r:id="rId${index + 1}"/>`).join("");
      const slideRelationships = slidePaths
        .map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`)
        .join("");
      source.file(
        "[Content_Types].xml",
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpg" ContentType="image/jpeg"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>${slideOverrides}</Types>`,
      );
      source.file("_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
      source.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId99"/></p:sldMasterIdLst><p:sldIdLst>${slideIds}</p:sldIdLst></p:presentation>`);
      source.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId99" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${slideRelationships}</Relationships>`);
      source.file(`ppt/slides/_rels/slide${selectedNumber}.xml.rels`, `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/photo.jpg"/><Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
      source.file("ppt/media/photo.jpg", new Uint8Array([255, 216, 32, 8, 0, 255, 217]));
      source.file("ppt/slideLayouts/slideLayout1.xml", `<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`);
      source.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
      source.file("ppt/slideMasters/slideMaster1.xml", `<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>`);
      source.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
      source.file("ppt/theme/theme1.xml", `<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`);
      return {
        name: fileName,
        relativePath: fileName,
        data: await source.generateAsync({ type: "uint8array" }),
      };
    };
    const originalOne = `<p:sld><a:t>FIRST SELECTED SOURCE SLIDE</a:t></p:sld>`;
    const originalTwo = `<p:sld><a:t>SECOND SELECTED SOURCE SLIDE</a:t></p:sld>`;
    const sourceFiles = new Map([
      [sampleSlides[0].deckFilePath, await makeSourceDeck(sampleSlides[0].deckFileName, 2, originalOne)],
      [sampleSlides[1].deckFilePath, await makeSourceDeck(sampleSlides[1].deckFileName, 3, originalTwo)],
    ]);

    const compiled = await compileCopiedPptx(manifest, sourceFiles);
    expect(compiled.fileName).toBe("PRIME_Proposal_Shopee_Express_2026-10-21.pptx");
    expect(compiled.slideCount).toBe(2);

    const loadedZip = await JSZip.loadAsync(compiled.buffer);
    expect(loadedZip.file("[Content_Types].xml")).not.toBeNull();
    expect(loadedZip.file("_rels/.rels")).not.toBeNull();
    expect(loadedZip.file("ppt/presentation.xml")).not.toBeNull();
    expect(loadedZip.file("ppt/slides/slide1.xml")).not.toBeNull();
    expect(loadedZip.file("ppt/slides/slide3.xml")).toBeNull();
    expect(await loadedZip.file("ppt/slides/slide1.xml")!.async("string")).toBe(originalOne);
    expect(await loadedZip.file("ppt/slides/slide2.xml")!.async("string")).toBe(originalTwo);
    const slideRels = await loadedZip.file("ppt/slides/_rels/slide1.xml.rels")!.async("string");
    expect(slideRels).toContain("../selected/slide1/assets/0-photo.jpg");
    expect(await loadedZip.file("ppt/selected/slide1/assets/0-photo.jpg")!.async("uint8array")).toEqual(
      new Uint8Array([255, 216, 32, 8, 0, 255, 217]),
    );
    const presentationXml = await loadedZip.file("ppt/presentation.xml")!.async("string");
    expect(presentationXml.match(/<p:sldMasterId\b/g)).toHaveLength(3);
    const presentationRelationships = await loadedZip.file("ppt/_rels/presentation.xml.rels")!.async("string");
    expect(presentationRelationships.match(/\/relationships\/slideMaster"/g)).toHaveLength(3);
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
