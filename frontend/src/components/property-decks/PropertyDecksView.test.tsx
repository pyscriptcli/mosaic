// @vitest-environment jsdom
import JSZip from "jszip";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBrowserPageCache } from "@/lib/browserPageCache";
import { PropertyDecksView } from "./PropertyDecksView";

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
  });

  it("loads catalog, allows overriding warehouse specs, and compiles a Comprehensive or Standard deck", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/property-decks" && (!init || init.method !== "POST")) {
        return new Response(
          JSON.stringify({
            catalog: mockCatalog,
            suggestedDefaultFolder: mockCatalog.sourceFolder,
          }),
          { status: 200 },
        );
      }
      if (url === "/api/property-decks/compile" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            outputPath: `${mockCatalog.outputFolder}\\PRIME_Proposal_${body.proposal.clientName}.pptx`,
            fileName: `PRIME_Proposal_${body.proposal.clientName}.pptx`,
            slideCount: body.proposal.mode === "comprehensive" ? 5 : 4,
            engine: "python-pptx-prime-master",
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<PropertyDecksView userName="Dave P." userEmail="dave@primephilippines.com" />);

    await waitFor(() => {
      expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined();
    });

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
    const addButtons = screen.getAllByRole("button", { name: /add to deck/i });
    fireEvent.click(addButtons[0]);
    fireEvent.click(addButtons[1]);

    // Switch deck format to Comprehensive Deck
    fireEvent.click(screen.getByRole("button", { name: /comprehensive deck/i }));

    // Fill Client Name
    const clientInput = screen.getByLabelText(/client name/i);
    fireEvent.change(clientInput, { target: { value: "FastCargo Logistics" } });

    // Compile Deck
    fireEvent.click(screen.getByRole("button", { name: /compile pptx deck/i }));

    await waitFor(() => {
      expect(screen.getByText(/PRIME_Proposal_FastCargo Logistics\.pptx/i)).toBeDefined();
    });
  });

  it("indexes local OneDrive PPTX files in the browser and compiles client-side when running on cloud/Vercel", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/property-decks" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            error:
              "OneDrive source folder not found: /var/task/frontend/C:\\Users\\PRIME_Dave\\OneDrive - Jet Innovisions\\Converted",
          }),
          { status: 400 },
        );
      }
      if (url === "/api/property-decks") {
        return new Response(
          JSON.stringify({
            catalog: null,
            suggestedDefaultFolder:
              "C:\\Users\\PRIME_Dave\\OneDrive - Jet Innovisions\\Sondi Tuazon's files - CRD 2026 COMPILED ONE DRIVE\\Industrial\\Property Deck\\Converted",
          }),
          { status: 200 },
        );
      }
      if (url === "/api/property-decks/compile") {
        return new Response(JSON.stringify({ error: "Server cannot access local path" }), {
          status: 400,
        });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<PropertyDecksView userName="Dave P." userEmail="dave@primephilippines.com" />);

    await waitFor(() => {
      expect(screen.getByText(/Configure OneDrive Deck Folders/i)).toBeDefined();
    });

    // Build an in-memory PPTX file and feed it to the local folder file input
    const zip = new JSZip();
    zip.file(
      "ppt/slides/slide1.xml",
      `<p:sld><a:p><a:t>PLARIDEL INDUSTRIAL PARK - WAREHOUSE A</a:t></a:p><a:p><a:t>Location: Plaridel, Bulacan</a:t></a:p><a:p><a:t>GLA: 6,000 sqm</a:t></a:p><a:p><a:t>Lease Rate: Php 280 / sqm</a:t></a:p></p:sld>`,
    );
    const pptxBytes = await zip.generateAsync({ type: "uint8array" });
    const mockFile = new File([pptxBytes as unknown as BlobPart], "Bulacan_Warehouses.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    Object.defineProperty(mockFile, "webkitRelativePath", {
      value: "Converted/Bulacan_Warehouses.pptx",
    });
    Object.defineProperty(mockFile, "arrayBuffer", {
      value: async () => pptxBytes.buffer.slice(pptxBytes.byteOffset, pptxBytes.byteOffset + pptxBytes.byteLength),
    });

    const folderInput = screen.getByTestId("onedrive-folder-input") as HTMLInputElement;
    fireEvent.change(folderInput, {
      target: { files: [mockFile] },
    });

    await waitFor(() => {
      expect(screen.getByText("PLARIDEL INDUSTRIAL PARK - WAREHOUSE A")).toBeDefined();
    });

    // Add to proposal and compile in browser
    fireEvent.click(screen.getByRole("button", { name: /add to deck/i }));
    fireEvent.change(screen.getByLabelText(/client name/i), {
      target: { value: "Lazada Logistics" },
    });
    fireEvent.click(screen.getByRole("button", { name: /compile pptx deck/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/PRIME_Proposal_Lazada_Logistics_Standard_/i),
      ).toBeDefined();
    });
  });

  it("simplifies filter tabs and groups same-title warehouse slides into collapsed cards with partial and full selection", async () => {
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
      if (url === "/api/property-decks") {
        return new Response(JSON.stringify({ catalog: multiSlideCatalog }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    vi.stubGlobal("fetch", fetchMock);

    render(<PropertyDecksView userName="Dave P." userEmail="dave@primephilippines.com" />);

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

    // 3. Sub-slides should be collapsed by default
    expect(screen.queryByText(/Warehouse Slides \(2\)/i)).toBeNull();

    // 4. Click Expand / Parts (2) button
    const expandButton = screen.getByRole("button", { name: /parts \(2\)/i });
    fireEvent.click(expandButton);

    // Now sub-slides are visible
    expect(screen.getByText(/Warehouse Slides \(2\)/i)).toBeDefined();
    expect(screen.getByText(/Specifications & Access/i)).toBeDefined();

    // 5. Select only ONE part of the group (Slide #3)
    const addPartButtons = screen.getAllByRole("button", { name: /add part/i });
    fireEvent.click(addPartButtons[0]);

    // Group header now indicates partial selection (1/2 Selected)
    expect(screen.getByText(/1\/2 Selected/i)).toBeDefined();

    // 6. Click Add All (2)
    const addAllButton = screen.getByRole("button", { name: /add all \(2\)/i });
    fireEvent.click(addAllButton);

    // Group header now indicates all selected
    expect(screen.getByText(/All 2 Selected/i)).toBeDefined();

    // 7. Click Remove All (2) to deselect the entire warehouse
    const removeAllButton = screen.getByRole("button", { name: /remove all \(2\)/i });
    fireEvent.click(removeAllButton);

    expect(screen.queryByText(/All 2 Selected/i)).toBeNull();
    expect(screen.queryByText(/1\/2 Selected/i)).toBeNull();
  });
});
