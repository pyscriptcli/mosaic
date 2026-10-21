import { describe, expect, it } from "vitest";
import {
  applySlideOverrides,
  buildCompilationManifest,
  extractSpecsFromSlideText,
  filterPropertySlides,
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
});
