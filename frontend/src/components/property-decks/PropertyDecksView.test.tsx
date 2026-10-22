// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBrowserPageCache } from "@/lib/browserPageCache";
import { PropertyDecksView } from "./PropertyDecksView";

const helperUrl = "http://127.0.0.1:43127";

const mockCatalog = {
  sourceFolder: "C:\\Users\\PRIME_Dave\\OneDrive - Jet Innovisions\\Industrial",
  outputFolder: "C:\\Users\\PRIME_Dave\\OneDrive - Jet Innovisions\\Industrial\\Compiled Proposals",
  indexedAt: "2026-10-21T06:30:00.000Z",
  decksCount: 2,
  slides: [
    {
      id: "deck-laguna:slide:2",
      deckId: "deck-laguna",
      deckFileName: "Laguna_Technopark_Options.pptx",
      deckFilePath: "C:\\OneDrive\\Laguna_Technopark_Options.pptx",
      slideNumber: 2,
      slideRole: "property" as const,
      title: "Biñan Logistics Center — Warehouse 4",
      rawText: "Biñan, Laguna 4,800 sqm 12m Php 360/sqm",
      thumbnailUrl: "/api/property-decks/thumbnail?id=deck-laguna:slide:2",
      specs: {
        propertyName: "Biñan Logistics Center — Warehouse 4",
        location: "Biñan, Laguna",
        gla: "4,800 sqm",
        ceilingHeight: "12m",
        leaseRate: "₱360/sqm",
        powerSupply: "3-Phase",
        loadingBays: "6 Elevated Bays",
        notes: "",
      },
    },
    {
      id: "deck-pasig:slide:1",
      deckId: "deck-pasig",
      deckFileName: "MSCS_Pasig_Deck.pptx",
      deckFilePath: "C:\\OneDrive\\MSCS_Pasig_Deck.pptx",
      slideNumber: 1,
      slideRole: "property" as const,
      title: "MSCS Pasig Distribution Hub",
      rawText: "Pasig City 2,100 sqm 10m Php 420/sqm",
      thumbnailUrl: "/api/property-decks/thumbnail?id=deck-pasig:slide:1",
      specs: {
        propertyName: "MSCS Pasig Distribution Hub",
        location: "Pasig City",
        gla: "2,100 sqm",
        ceilingHeight: "10m",
        leaseRate: "₱420/sqm",
        powerSupply: "3-Phase",
        loadingBays: "3 Bays",
        notes: "",
      },
    },
  ],
};

describe("PropertyDecksView component", () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearBrowserPageCache("local");
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads the catalog, allows spec overrides, and exports the selected source slides", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url === `${helperUrl}/api/property-decks` && (!init || init.method !== "POST")) {
        return new Response(
          JSON.stringify({
            catalog: mockCatalog,
            suggestedDefaultFolder: mockCatalog.sourceFolder,
          }),
          { status: 200 },
        );
      }
      if (url === `${helperUrl}/api/property-decks/compile` && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            downloadId: "8a5ab5c2-f4b4-41a0-9199-9ed6a4a53f75",
            outputPath: `${mockCatalog.outputFolder}\\PRIME_Proposal_${body.proposal.clientName}.pptx`,
            fileName: `PRIME_Proposal_${body.proposal.clientName}.pptx`,
            slideCount: body.proposal.mode === "comprehensive" ? 5 : 4,
            engine: "python-pptx-prime-master",
          }),
          { status: 200 },
        );
      }
      if (url === `${helperUrl}/api/property-decks/compile` && init?.method === "PUT") {
        return new Response(JSON.stringify({ pdfFileName: "PRIME_Proposal_FastCargo Logistics.pdf" }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<PropertyDecksView />);

    await waitFor(() => {
      expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined();
    });

    expect(screen.getAllByRole("button", { name: /add all \(1\)/i }).length).toBeGreaterThan(0);

    const thumbnail = screen.getByAltText("Biñan Logistics Center — Warehouse 4");
    expect(thumbnail.getAttribute("src")).toBe(
      `${helperUrl}/api/property-decks/thumbnail?id=deck-laguna:slide:2`,
    );
    expect(thumbnail.getAttribute("crossorigin")).toBe("anonymous");

    // Open Spec Override Modal for the first warehouse
    const editButtons = screen.getAllByRole("button", { name: /edit specs/i });
    fireEvent.click(editButtons[0]);

    const rateInput = screen.getByLabelText(/lease rate/i);
    fireEvent.change(rateInput, { target: { value: "₱335/sqm (Negotiated)" } });

    const notesInput = screen.getByLabelText(/broker notes/i);
    fireEvent.change(notesInput, { target: { value: "PEZA registered building" } });

    fireEvent.click(screen.getByRole("button", { name: /save specs/i }));

    // Verify overridden rate is visible on the gallery card
    expect(screen.getByText("₱335/sqm (Negotiated)")).toBeDefined();

    // Select both slides into the Proposal Cart
    const addButtons = screen.getAllByRole("button", { name: /add this slide/i });
    fireEvent.click(addButtons[0]);
    fireEvent.click(addButtons[1]);

    // Fill Client Name
    const clientInput = screen.getByLabelText(/client name/i);
    fireEvent.change(clientInput, { target: { value: "FastCargo Logistics" } });
    fireEvent.change(screen.getByLabelText(/client designation/i), { target: { value: "Supply Chain Director" } });
    fireEvent.change(screen.getByLabelText(/client company/i), { target: { value: "FastCargo Inc." } });
    fireEvent.click(screen.getByRole("button", { name: "Sondi" }));
    expect((screen.getByLabelText("Prepared by name") as HTMLInputElement).value).toBe("Sondi Tuazon");
    const logo = new File([new Uint8Array([137, 80, 78, 71])], "fastcargo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload company logo"), { target: { files: [logo] } });
    await screen.findByAltText("Client logo preview");

    // Export selected slides
    fireEvent.click(screen.getByRole("button", { name: /export selected slides/i }));

    await waitFor(() => {
      expect(screen.getByText("PRIME_Proposal_FastCargo Logistics.pptx")).toBeDefined();
      expect(screen.getByRole("button", { name: "Download PPTX" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Download PDF" })).toBeDefined();
    });
    const compileRequest = fetchMock.mock.calls.find(([url, init]) => String(url) === `${helperUrl}/api/property-decks/compile` && init?.method === "POST");
    expect(JSON.parse(String(compileRequest?.[1]?.body)).proposal).toMatchObject({
      clientName: "FastCargo Logistics",
      clientDesignation: "Supply Chain Director",
      clientCompany: "FastCargo Inc.",
      preparedByName: "Sondi Tuazon",
    });
    expect(JSON.parse(String(compileRequest?.[1]?.body)).proposal.clientLogoDataUrl).toMatch(/^data:image\/png;base64,/);
    expect(screen.queryByRole("button", { name: /open in powerpoint/i })).toBeNull();
  });

  it("rescans the configured local path through Mosaic Helper and refreshes the gallery", async () => {
    const updatedCatalog = {
      ...mockCatalog,
      indexedAt: "2026-10-22T01:00:00.000Z",
      slides: mockCatalog.slides.map((slide, index) => ({
        ...slide,
        title: index === 0 ? "Updated Warehouse Name" : slide.title,
        specs: index === 0 ? { ...slide.specs, propertyName: "Updated Warehouse Name" } : slide.specs,
      })),
    };
    localStorage.setItem(
      "mosaic_property_decks_config_v1",
      JSON.stringify({ sourceFolder: mockCatalog.sourceFolder, outputFolder: mockCatalog.outputFolder }),
    );
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (String(input) === `${helperUrl}/api/property-decks` && init?.method === "POST") {
        return new Response(JSON.stringify({ catalog: updatedCatalog }), { status: 200 });
      }
      if (String(input) === `${helperUrl}/api/property-decks`) {
        return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());

    expect(screen.queryByTestId("onedrive-folder-input")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /rescan folder/i }));

    await waitFor(() => expect(screen.getByText("Updated Warehouse Name")).toBeDefined());
    const scanRequest = fetchMock.mock.calls.find(([url, init]) => String(url) === `${helperUrl}/api/property-decks` && init?.method === "POST");
    expect(JSON.parse(String(scanRequest?.[1]?.body))).toEqual({
      sourceFolder: mockCatalog.sourceFolder,
      outputFolder: mockCatalog.outputFolder,
    });
  });

  it("keeps the PPTX download available and reports a PDF conversion failure", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (String(input) === `${helperUrl}/api/property-decks` && (!init || init.method !== "POST")) {
        return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      }
      if (String(input) === `${helperUrl}/api/property-decks/compile` && init?.method === "POST") {
        return new Response(JSON.stringify({
          downloadId: "8a5ab5c2-f4b4-41a0-9199-9ed6a4a53f75",
          outputPath: `${mockCatalog.outputFolder}\\PRIME_Proposal_Client.pptx`,
          fileName: "PRIME_Proposal_Client.pptx",
          slideCount: 1,
          engine: "openxml-slide-copy",
        }), { status: 200 });
      }
      if (String(input) === `${helperUrl}/api/property-decks/compile` && init?.method === "PUT") {
        return new Response(JSON.stringify({ error: "PDF conversion requires Windows and Microsoft PowerPoint." }), { status: 500 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());
    fireEvent.click(screen.getAllByRole("button", { name: /add this slide/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /export selected slides/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("PPTX download is ready. PDF conversion failed");
    expect(screen.getByRole("button", { name: "Download PPTX" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
  });

  it("shows both export stages, elapsed time, and prevents duplicate exports while requests are pending", async () => {
    let resolvePptx!: (response: Response) => void;
    let resolvePdf!: (response: Response) => void;
    let pptxRequestCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks` && (!init || init.method !== "POST")) {
        return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      }
      if (url === `${helperUrl}/api/property-decks/compile` && init?.method === "POST") {
        pptxRequestCount += 1;
        return new Promise<Response>((resolve) => { resolvePptx = resolve; });
      }
      if (url === `${helperUrl}/api/property-decks/compile` && init?.method === "PUT") {
        return new Promise<Response>((resolve) => { resolvePdf = resolve; });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());
    fireEvent.click(screen.getAllByRole("button", { name: /add this slide/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /export selected slides/i }));

    const exportButton = screen.getByRole("button", { name: /building powerpoint/i });
    expect(exportButton.hasAttribute("disabled")).toBe(true);
    const pptxProgress = screen.getByText(/Compiling 1 selected slide into PowerPoint/).parentElement?.parentElement;
    expect(pptxProgress?.textContent).toContain("Elapsed 0:");
    await waitFor(() => expect(pptxProgress?.textContent).toContain("Elapsed 0:01"), { timeout: 1500 });
    fireEvent.click(exportButton);
    expect(pptxRequestCount).toBe(1);

    resolvePptx(new Response(JSON.stringify({
      downloadId: "8a5ab5c2-f4b4-41a0-9199-9ed6a4a53f75",
      outputPath: `${mockCatalog.outputFolder}\\PRIME_Proposal_Client.pptx`,
      fileName: "PRIME_Proposal_Client.pptx",
      slideCount: 1,
      engine: "microsoft-powerpoint",
    }), { status: 200 }));

    const pdfButton = await screen.findByRole("button", { name: /converting to pdf/i });
    expect(pdfButton.hasAttribute("disabled")).toBe(true);
    const pdfProgress = screen.getByText(/Converting PowerPoint to PDF/).parentElement?.parentElement;
    expect(pdfProgress?.textContent).toContain("Elapsed 0:");
    expect(screen.getByRole("button", { name: "Download PPTX" })).toBeDefined();

    resolvePdf(new Response(JSON.stringify({ pdfFileName: "PRIME_Proposal_Client.pdf" }), { status: 200 }));
    await waitFor(() => expect(screen.getByText("PPTX and PDF ready to download.")).toBeDefined());
  });

  it("simplifies filter tabs and supports slide and bulk selection from grouped warehouse cards", async () => {
    const multiSlideCatalog = {
      sourceFolder: "C:\\OneDrive\\Converted",
      outputFolder: "C:\\OneDrive\\Proposals",
      indexedAt: "2026-10-21T07:00:00.000Z",
      decksCount: 1,
      slides: [
        {
          id: "deck-bataan:slide:3",
          deckId: "deck-bataan",
          deckFileName: "PRIME_IW_Bataan.pptx",
          deckFilePath: "C:\\OneDrive\\PRIME_IW_Bataan.pptx",
          slideNumber: 3,
          slideRole: "property" as const,
          title: "Bataan Warehouse Space — Lease Terms & Units",
          rawText: "Hermosa, Bataan 5,000 sqm Php 250/sqm",
          thumbnailUrl: "/property-decks/previews/bataan_s3.jpg",
          specs: {
            propertyName: "Bataan Warehouse Space",
            location: "Hermosa, Bataan",
            gla: "5,000 sqm",
            ceilingHeight: "10m",
            leaseRate: "₱250/sqm",
            powerSupply: "3-Phase",
            loadingBays: "4 Bays",
            notes: "",
          },
        },
        {
          id: "deck-bataan:slide:4",
          deckId: "deck-bataan",
          deckFileName: "PRIME_IW_Bataan.pptx",
          deckFilePath: "C:\\OneDrive\\PRIME_IW_Bataan.pptx",
          slideNumber: 4,
          slideRole: "property" as const,
          title: "Bataan Warehouse Space — Specifications & Access",
          rawText: "Hermosa, Bataan 10m clear height 3-Phase power",
          thumbnailUrl: "/property-decks/previews/bataan_s4.jpg",
          specs: {
            propertyName: "Bataan Warehouse Space",
            location: "Hermosa, Bataan",
            gla: "5,000 sqm",
            ceilingHeight: "10m",
            leaseRate: "₱250/sqm",
            powerSupply: "3-Phase",
            loadingBays: "4 Bays",
            notes: "",
          },
        },
      ],
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url === `${helperUrl}/api/property-decks`) {
        return new Response(JSON.stringify({ catalog: multiSlideCatalog }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<PropertyDecksView />);

    await waitFor(() => {
      expect(screen.getByText("Bataan Warehouse Space")).toBeDefined();
    });

    // 1. Verify Vicinity / Maps and Summary Matrices tabs are absent
    expect(screen.queryByRole("tab", { name: /vicinity/i })).toBeNull();
    expect(screen.queryByRole("tab", { name: /summary/i })).toBeNull();
    expect(screen.getByRole("tab", { name: /warehouse options/i })).toBeDefined();
    expect(screen.getByRole("tab", { name: /all slides/i })).toBeDefined();

    // 2. Verify warehouse is grouped into 1 card showing slide range
    expect(screen.getByText(/Slides #3–#4/i)).toBeDefined();
    expect(screen.getAllByText(/\(2 slides\)/i).length).toBeGreaterThan(0);

    // The large preview can be browsed without expanding the parts list.
    expect(screen.getByRole("img", { name: /Lease Terms & Units/i })).toBeDefined();
    expect(screen.getByText("Slide #3 · 1 of 2")).toBeDefined();
    expect(screen.getByRole("button", { name: /previous slide/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /next slide/i }));
    expect(screen.getByRole("img", { name: /Specifications & Access/i })).toBeDefined();
    expect(screen.getByText("Slide #4 · 2 of 2")).toBeDefined();
    expect(screen.getByRole("button", { name: /next slide/i }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /previous slide/i }));
    expect(screen.getByText("Slide #3 · 1 of 2")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: /next slide/i }));
    expect(screen.getByText("Slide #4 · 2 of 2")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /add this slide/i }));
    expect(screen.getByText("Selected Slides (1)")).toBeDefined();
    expect(screen.getByText(/Bataan Warehouse Space — Specifications & Access/i)).toBeDefined();
    expect(screen.getByText(/1\/2 Selected/i)).toBeDefined();

    // The card keeps its bulk action without an extra Parts control.
    expect(screen.queryByRole("button", { name: /parts \(2\)/i })).toBeNull();

    // Add All selects the entire warehouse, including the unpreviewed slide.
    const addAllButton = screen.getByRole("button", { name: /add all \(2\)/i });
    fireEvent.click(addAllButton);
    expect(screen.getByText(/All 2 Selected/i)).toBeDefined();

    const removeAllButton = screen.getByRole("button", { name: /remove all \(2\)/i });
    fireEvent.click(removeAllButton);

    expect(screen.queryByText(/All 2 Selected/i)).toBeNull();
    expect(screen.queryByText(/1\/2 Selected/i)).toBeNull();

    expect(screen.getByRole("button", { name: /add all \(2\)/i })).toBeDefined();
  });

  it("shows three expanded proposal sections and groups location options by city", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) {
        return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());

    for (const section of ["Coverpage", "Properties", "CTA"]) {
      expect(screen.getByRole("button", { name: `Collapse ${section}` }).getAttribute("aria-expanded")).toBe("true");
    }

    const coverToggle = screen.getByRole("button", { name: "Collapse Coverpage" });
    fireEvent.click(coverToggle);
    expect(screen.getByRole("button", { name: "Expand Coverpage" }).getAttribute("aria-expanded")).toBe("false");

    const locations = screen.getByLabelText(/filter by location/i);
    expect(within(locations).getByRole("group", { name: "Biñan" })).toBeDefined();
    expect(within(locations).getByRole("group", { name: "Pasig" })).toBeDefined();
  });

  it("keeps the cover, location divider, property pages, and CTA together in their assembler sections", async () => {
    const property = mockCatalog.slides[1];
    const deckSlides = [
      { ...property, id: "deck-pasig:slide:cover", slideNumber: 1, slideRole: "cover" as const, title: "Client Proposal Cover", rawText: "Prepared by PRIME" },
      { ...property, id: "deck-pasig:slide:proposal", slideNumber: 2, slideRole: "cover" as const, title: "Industrial Facility Proposal", rawText: "Industrial Facility Proposal\nPasig City" },
      property,
      { ...property, id: "deck-pasig:slide:4", slideNumber: 4, slideRole: "closing" as const, title: "For more information and to schedule a viewing contact us", rawText: "Contact PRIME" },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: { ...mockCatalog, slides: deckSlides, decksCount: 1 } }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("MSCS Pasig Distribution Hub")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: /add this slide/i }));

    expect(screen.getByText("Selected Slides (4)")).toBeDefined();
    expect(screen.getByText(/Client Proposal Cover/)).toBeDefined();
    expect(screen.getAllByText(/Industrial Facility Proposal/).length).toBeGreaterThan(0);
    expect(screen.getByText(/For more information and to schedule a viewing contact us/)).toBeDefined();
  });
});
