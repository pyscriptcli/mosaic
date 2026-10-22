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

  it("keeps cover details compact and reveals prepared-by fields only on request", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());

    expect(screen.getByLabelText("Contact person")).toBeDefined();
    expect(screen.getByLabelText("Job title")).toBeDefined();
    expect(screen.getByLabelText("Company")).toBeDefined();
    expect(screen.queryByText("Broker Name(s) / Lead Advisor")).toBeNull();
    expect(screen.queryByLabelText("Prepared by name")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Sondi" }));
    expect(screen.getByText("Sondi Tuazon")).toBeDefined();
    expect(screen.getByText("Sr. Head · Retail and Industrial Markets · PRIME Philippines")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect((screen.getByLabelText("Prepared by name") as HTMLInputElement).value).toBe("Sondi Tuazon");
    expect((screen.getByLabelText("Prepared by designation") as HTMLInputElement).value).toBe("Sr. Head · Retail and Industrial Markets");
  });

  it("selects CTA contacts in order and includes custom contact details and photo in the export request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks/compile` && init?.method === "POST") {
        return new Response(JSON.stringify({ downloadId: "export-1", outputPath: "proposal.pptx", fileName: "proposal.pptx", slideCount: 3, engine: "test" }), { status: 200 });
      }
      if (url === `${helperUrl}/api/property-decks/compile` && init?.method === "PUT") return new Response(JSON.stringify({ pdfFileName: "proposal.pdf" }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());

    fireEvent.click(screen.getAllByRole("button", { name: "Add This Slide" })[0]);
    fireEvent.click(screen.getByRole("tab", { name: /CTA/ }));
    const sondiContact = screen.getByRole("checkbox", { name: "Select Sondi Tuazon" });
    const cedtrixContact = screen.getByRole("checkbox", { name: "Select Cedtrix Rena" });
    fireEvent.click(sondiContact);
    fireEvent.click(cedtrixContact);
    fireEvent.click(sondiContact);
    fireEvent.click(cedtrixContact);
    const preview = screen.getByLabelText("CTA contact slide preview");
    expect(preview.textContent?.indexOf("Sondi Tuazon")).toBeLessThan(preview.textContent?.indexOf("Cedtrix Rena") ?? -1);
    expect(preview.textContent).toContain("+63 917 845 6128");
    expect(preview.textContent).toContain("sondi.tuazon@primephilippines.com");

    fireEvent.click(screen.getByRole("button", { name: /Add custom contact/i }));
    fireEvent.change(screen.getByLabelText("Custom contact name"), { target: { value: "Jamie Cruz" } });
    fireEvent.change(screen.getByLabelText("Custom contact title"), { target: { value: "Property Manager" } });
    fireEvent.change(screen.getByLabelText("Custom contact phone"), { target: { value: "+63 900 111 2222" } });
    fireEvent.change(screen.getByLabelText("Custom contact email"), { target: { value: "jamie@example.com" } });
    const portrait = new File([new Uint8Array([137, 80, 78, 71])], "jamie.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Custom contact photo"), { target: { files: [portrait] } });
    await screen.findByAltText("Custom contact photo selected");
    fireEvent.click(screen.getByRole("button", { name: "Save contact" }));
    await waitFor(() => expect(preview.textContent).toContain("Jamie Cruz"));
    expect(preview.querySelector("img")?.className).toContain("object-cover");

    fireEvent.click(screen.getByRole("button", { name: "Export Proposal" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Download PPTX" })).toBeDefined());
    const compileRequest = fetchMock.mock.calls.find(([url, init]) => String(url) === `${helperUrl}/api/property-decks/compile` && init?.method === "POST");
    const proposal = JSON.parse(String(compileRequest?.[1]?.body)).proposal;
    expect(proposal.ctaContacts.map((contact: { name: string }) => contact.name)).toEqual(["Sondi Tuazon", "Cedtrix Rena", "Jamie Cruz"]);
    expect(proposal.ctaContacts[0]).toMatchObject({ phone: "+63 917 845 6128", email: "sondi.tuazon@primephilippines.com" });
    expect(proposal.ctaContacts[2].photoDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("opens demand matching, ranks exact before partial, explains criteria, and resets", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());

    const toggle = screen.getByRole("button", { name: "Demand Matching" });
    expect(screen.queryByLabelText("Minimum GLA")).toBeNull();
    expect(screen.queryByLabelText("Maximum GLA")).toBeNull();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const panel = screen.getByRole("region", { name: "Demand matching requirements" });
    fireEvent.click(within(panel).getByText("All cities"));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Prefer Pasig" }));
    fireEvent.change(within(panel).getByLabelText("Minimum leasable area (sqm)"), { target: { value: "2,000" } });
    fireEvent.change(within(panel).getByLabelText("Maximum leasable area (sqm)"), { target: { value: "2,500" } });
    fireEvent.change(within(panel).getByLabelText("Minimum lease rate (Php/sqm)"), { target: { value: "350" } });
    fireEvent.change(within(panel).getByLabelText("Maximum lease rate (Php/sqm)"), { target: { value: "450" } });
    fireEvent.change(within(panel).getByLabelText("Minimum clear height (m)"), { target: { value: "9" } });
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Three-phase power" }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Loading dock or bay" }));
    fireEvent.change(within(panel).getByLabelText("Other requirements"), { target: { value: "Pasig" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Find matching properties" }));

    const resultList = screen.getByRole("region", { name: "Demand match results" });
    const exactCard = within(resultList).getByText(/Exact match/).closest("article");
    const partialCard = within(resultList).getByText(/Partial match/).closest("article");
    expect(exactCard?.textContent).toContain("MSCS Pasig Distribution Hub");
    expect(exactCard?.textContent).toContain("Other requirements");
    expect(exactCard?.textContent).toContain("Pasig");
    expect(partialCard?.textContent).toContain("Biñan Logistics Center — Warehouse 4");
    expect(partialCard?.textContent).toContain("Meets");
    expect(partialCard?.textContent).toContain("Not met");

    fireEvent.click(within(panel).getByRole("button", { name: "Reset criteria" }));
    expect((within(panel).getByLabelText("Minimum leasable area (sqm)") as HTMLInputElement).value).toBe("");
    expect(screen.queryByRole("region", { name: "Demand match results" })).toBeNull();
  });

  it("shows a clear empty state when no property meets the demand criteria", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Demand Matching" }));
    const panel = screen.getByRole("region", { name: "Demand matching requirements" });
    fireEvent.change(within(panel).getByLabelText("Minimum leasable area (sqm)"), { target: { value: "20000" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Find matching properties" }));
    expect(screen.getByText("No properties match these requirements")).toBeDefined();
    expect(screen.queryByText("Biñan Logistics Center — Warehouse 4")).toBeNull();
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
    const clientInput = screen.getByLabelText(/contact person/i);
    fireEvent.change(clientInput, { target: { value: "FastCargo Logistics" } });
    fireEvent.change(screen.getByLabelText(/job title/i), { target: { value: "Supply Chain Director" } });
    fireEvent.change(screen.getByLabelText(/^company$/i), { target: { value: "FastCargo Inc." } });
    fireEvent.click(screen.getByRole("button", { name: "Sondi" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect((screen.getByLabelText("Prepared by name") as HTMLInputElement).value).toBe("Sondi Tuazon");
    const logo = new File([new Uint8Array([137, 80, 78, 71])], "fastcargo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Upload company logo"), { target: { files: [logo] } });
    await screen.findByAltText("Client logo preview");

    // Export selected slides
    fireEvent.click(screen.getByRole("button", { name: "Export Proposal" }));

    await waitFor(() => {
      expect(screen.getByText("PRIME_Proposal_FastCargo Logistics.pptx")).toBeDefined();
      expect(screen.getByRole("button", { name: "Download PPTX" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Download PDF" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Show in Explorer" })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("tab", { name: /CTA/ }));
    expect(screen.getByRole("button", { name: "Export Proposal" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Download PPTX" })).toBeDefined();
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
    fireEvent.click(screen.getByRole("button", { name: "Export Proposal" }));

    expect((await screen.findByRole("alert")).textContent).toContain("PPTX download is ready. PDF conversion failed");
    expect(screen.getByRole("button", { name: "Download PPTX" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Download PDF" }).hasAttribute("disabled")).toBe(true);
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
    fireEvent.click(screen.getByRole("button", { name: "Export Proposal" }));

    const exportButton = screen.getByRole("button", { name: /preparing/i });
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

    const pdfButton = await screen.findByRole("button", { name: /preparing pdf/i });
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
    fireEvent.click(screen.getByRole("tab", { name: /Properties/ }));
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

  it("shows accessible proposal tabs with dynamic page counts and preserves cover edits when switching", async () => {
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

    const tablist = screen.getByRole("tablist", { name: "Proposal sections" });
    const tabs = within(tablist).getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[0].textContent).toContain("Coverpage");
    expect(tabs[1].textContent).toContain("Properties");
    expect(tabs[2].textContent).toContain("CTA");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);

    fireEvent.change(screen.getByLabelText("Contact person"), { target: { value: "FastCargo Logistics" } });
    fireEvent.click(screen.getByRole("button", { name: "Sondi" }));
    fireEvent.keyDown(tabs[0], { key: "ArrowRight" });
    await waitFor(() => expect(document.activeElement).toBe(tabs[1]));
    expect(tabs[1].getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(tabs[1].id);
    fireEvent.keyDown(tabs[1], { key: "ArrowRight" });
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(tabs[2], { key: "ArrowRight" });
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect((screen.getByLabelText("Contact person") as HTMLInputElement).value).toBe("FastCargo Logistics");
    fireEvent.click(screen.getByRole("button", { name: "Edit details" }));
    expect((screen.getByLabelText("Prepared by name") as HTMLInputElement).value).toBe("Sondi Tuazon");

    const locations = screen.getByLabelText(/filter by location/i);
    expect(within(locations).getByRole("group", { name: "Biñan" })).toBeDefined();
    expect(within(locations).getByRole("group", { name: "Pasig" })).toBeDefined();
  });

  it("keeps property order and selection when moving between tabs", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());
    fireEvent.click(screen.getAllByRole("button", { name: /add this slide/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /add this slide/i }));
    const propertiesTab = screen.getByRole("tab", { name: /Properties/ });
    fireEvent.click(propertiesTab);
    const panel = screen.getByRole("tabpanel");
    expect(within(panel).getByText("Selected properties")).toBeDefined();
    fireEvent.click(within(panel).getByRole("button", { name: "Move MSCS Pasig Distribution Hub up" }));
    const reordered = within(panel).getAllByRole("listitem").map((item) => item.textContent || "");
    expect(reordered[0]).toContain("MSCS Pasig Distribution Hub");

    fireEvent.click(screen.getByRole("tab", { name: /CTA/ }));
    expect(screen.getByRole("tab", { name: /Properties/ }).getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByRole("tab", { name: /Properties/ }));
    expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem")[0].textContent).toContain("MSCS Pasig Distribution Hub");
    expect(screen.getByText("Selected Slides (2)")).toBeDefined();
    fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Remove MSCS Pasig Distribution Hub" }));
    expect(screen.getByText("Selected Slides (1)")).toBeDefined();
    fireEvent.click(screen.getByRole("tab", { name: /CTA/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Properties/ }));
    expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem")).toHaveLength(1);
    expect(within(screen.getByRole("tabpanel")).getByText(/Biñan Logistics Center/)).toBeDefined();
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
    expect(screen.queryByText(/Client Proposal Cover/)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Properties/ }));
    expect(screen.getAllByText(/Industrial Facility Proposal/).length).toBeGreaterThan(1);
    fireEvent.click(screen.getByRole("tab", { name: /CTA/ }));
    expect(screen.getByText(/For more information and to schedule a viewing contact us/)).toBeDefined();
  });

  it("keeps all proposal tabs reachable in the compact narrow-width layout", async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 360 });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));

    try {
      render(<PropertyDecksView />);
      await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());
      const tablist = screen.getByRole("tablist", { name: "Proposal sections" });
      expect(tablist.className).toContain("overflow-x-auto");
      expect(screen.getByRole("complementary", { name: "Proposal deck compiler" }).className).toContain("min-w-0");
      const tabs = within(tablist).getAllByRole("tab");
      expect(tabs).toHaveLength(3);
      expect(tabs.every((tab) => tab.className.includes("shrink-0"))).toBe(true);
      fireEvent.click(tabs[2]);
      expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
    }
  });
});
