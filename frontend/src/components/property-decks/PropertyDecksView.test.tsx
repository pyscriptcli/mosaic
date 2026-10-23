// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearBrowserPageCache } from "@/lib/browserPageCache";
import { PropertyDecksView } from "./PropertyDecksView";

const helperUrl = "http://127.0.0.1:43127";
const defaultExportChecklist = [
  { id: "pptx", label: "PPTX structure and slide order", status: "passed" },
  { id: "cover-cta", label: "One cover and one final CTA", status: "passed" },
  { id: "dividers", label: "City dividers included", status: "passed" },
  { id: "pdf", label: "PDF opens and matches the slide count", status: "passed" },
];

function withExportJobProtocol(fetchMock: ReturnType<typeof vi.fn>, statusOverride?: (url: string) => Response | null) {
  let proposal: Record<string, unknown> = {};
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const original = await fetchMock(input, init);
    if (url === helperUrl + "/api/property-decks/export-jobs" && init?.method === "POST") {
      const body = JSON.parse(String(init.body || "{}"));
      proposal = body.proposal || {};
      return new Response(JSON.stringify({ jobId: "89a73bcb-ade6-4ee4-a353-45a1be034d49" }), { status: 202 });
    }
    if (url.startsWith(helperUrl + "/api/property-decks/export-jobs?id=")) {
      const override = statusOverride?.(url);
      if (override) return override;
      const name = String(proposal.clientName || "Client").replace(/[^a-z0-9 _-]/gi, "");
      const fileName = "PRIME_Proposal_" + name + "_2026-10-23.pptx";
      return new Response(JSON.stringify({
        jobId: "89a73bcb-ade6-4ee4-a353-45a1be034d49",
        status: "ready",
        progress: { stage: "ready", currentSlide: 4, totalSlides: 4, title: "Export verified" },
        previews: [],
        checklist: defaultExportChecklist,
        result: { downloadId: "export-1", outputPath: mockCatalog.outputFolder + "\\" + fileName, fileName, pdfFileName: fileName.replace(/\.pptx$/i, ".pdf"), slideCount: 4, engine: "microsoft-powerpoint" },
      }), { status: 200 });
    }
    return original;
  });
}

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

  it("restarts the helper from its status control and refreshes the catalog", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true, pid: 202 }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks/helper/restart`) {
        return new Response(JSON.stringify({ restarting: true, pid: 101 }), { status: 202 });
      }
      if (url === `${helperUrl}/api/property-decks` && init?.method === "POST") {
        return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      }
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", withExportJobProtocol(fetchMock));
    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Mosaic Helper connected. Restart helper" })).toBeDefined());
    const helperControl = screen.getByRole("button", { name: "Mosaic Helper connected. Restart helper" });
    expect(helperControl.textContent).toContain("Mosaic Helper connected");
    expect(helperControl.textContent).toContain("Restart");
    expect(screen.getAllByText("Mosaic Helper connected")).toHaveLength(1);

    fireEvent.click(helperControl);

    await waitFor(() => expect(screen.getByText("Mosaic Helper restarted and catalog refreshed.")).toBeDefined());
    expect(fetchMock).toHaveBeenCalledWith(`${helperUrl}/api/property-decks/helper/restart`, expect.objectContaining({ method: "POST" }));
    expect(fetchMock).toHaveBeenCalledWith(`${helperUrl}/api/property-decks`, expect.objectContaining({ method: "POST" }));
  });

  it("explains how to start the helper when the local process is offline", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Mosaic Helper offline. Start or restart helper" })).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Mosaic Helper offline. Start or restart helper" }));

    await waitFor(() => expect(screen.getByText(/Start it and allow this site to access your local network/)).toBeDefined());
  });

  it("shows city names only in the location filter and filters properties by city", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }));
    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());

    const locationFilter = screen.getByRole("combobox", { name: "Filter by location" }) as HTMLSelectElement;
    expect(Array.from(locationFilter.options).map((option) => option.textContent?.trim())).toEqual([
      "All locations",
      "Biñan",
      "Pasig",
    ]);
    expect(locationFilter.querySelector("optgroup")).toBeNull();

    fireEvent.change(locationFilter, { target: { value: "Biñan" } });
    expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined();
    expect(screen.queryByText("MSCS Pasig Distribution Hub")).toBeNull();
  });

  it("selects CTA contacts in order and includes custom contact details and photo in the export request", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks/export-jobs` && init?.method === "POST") {
        return new Response(JSON.stringify({ downloadId: "export-1", outputPath: "proposal.pptx", fileName: "proposal.pptx", slideCount: 3, engine: "test" }), { status: 200 });
      }
      if (url === `${helperUrl}/api/property-decks/compile` && init?.method === "PUT") return new Response(JSON.stringify({ pdfFileName: "proposal.pdf" }), { status: 200 });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", withExportJobProtocol(fetchMock));
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
    const compileRequest = fetchMock.mock.calls.find(([url, init]) => String(url) === `${helperUrl}/api/property-decks/export-jobs` && init?.method === "POST");
    const proposal = JSON.parse(String(compileRequest?.[1]?.body)).proposal;
    expect(proposal.ctaContacts.map((contact: { name: string }) => contact.name)).toEqual(["Sondi Tuazon", "Cedtrix Rena", "Jamie Cruz"]);
    expect(proposal.ctaContacts[0]).toMatchObject({ phone: "+63 917 845 6128", email: "sondi.tuazon@primephilippines.com" });
    expect(proposal.ctaContacts[2].photoDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("sends the compiled file to Explorer and reports when the helper cannot open it", async () => {
    let failOpen = true;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks`) return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks/export-jobs` && init?.method === "POST") {
        return new Response(JSON.stringify({ downloadId: "export-1", outputPath: "C:\\Proposals\\proposal.pptx", fileName: "proposal.pptx", slideCount: 4 }), { status: 200 });
      }
      if (url === `${helperUrl}/api/property-decks/compile` && init?.method === "PUT") return new Response(JSON.stringify({ pdfFileName: "proposal.pdf" }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks/open`) {
        return failOpen
          ? new Response(JSON.stringify({ error: "Explorer launch failed." }), { status: 500 })
          : new Response(JSON.stringify({ opened: true }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", withExportJobProtocol(fetchMock));
    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());
    fireEvent.click(screen.getAllByRole("button", { name: "Add This Slide" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Export Proposal" }));
    const showButton = await screen.findByRole("button", { name: "Show in Explorer" });

    fireEvent.click(showButton);
    expect(await screen.findByText("Could not open the proposal in File Explorer: Explorer launch failed.")).toBeDefined();
    const openRequest = fetchMock.mock.calls.find(([url]) => String(url) === `${helperUrl}/api/property-decks/open`);
    expect(JSON.parse(String(openRequest?.[1]?.body))).toMatchObject({
      targetPath: mockCatalog.outputFolder + "\\PRIME_Proposal_Client_2026-10-23.pptx",
      action: "reveal-folder",
    });

    failOpen = false;
    fireEvent.click(showButton);
    expect(await screen.findByText("Opened the proposal location in File Explorer.")).toBeDefined();
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
      if (url === `${helperUrl}/api/property-decks/export-jobs` && init?.method === "POST") {
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

    vi.stubGlobal("fetch", withExportJobProtocol(fetchMock));

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
      expect(screen.getByText("PRIME_Proposal_FastCargo Logistics_2026-10-23.pptx")).toBeDefined();
      expect(screen.getByRole("button", { name: "Download PPTX" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Download PDF" })).toBeDefined();
      expect(screen.getByRole("button", { name: "Show in Explorer" })).toBeDefined();
    });
    const exportButton = screen.getByRole("button", { name: "Export Proposal" });
    const exportOptions = screen.getByRole("group", { name: "Proposal export options" });
    expect(exportButton.compareDocumentPosition(exportOptions) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /CTA/ }));
    expect(screen.getByRole("button", { name: "Export Proposal" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Download PPTX" })).toBeDefined();
    const compileRequest = fetchMock.mock.calls.find(([url, init]) => String(url) === `${helperUrl}/api/property-decks/export-jobs` && init?.method === "POST");
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
    vi.stubGlobal("fetch", withExportJobProtocol(fetchMock));

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

  it("blocks both downloads when PDF validation fails", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (String(input) === `${helperUrl}/api/property-decks` && (!init || init.method !== "POST")) {
        return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      }
      if (String(input) === `${helperUrl}/api/property-decks/export-jobs` && init?.method === "POST") {
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
    vi.stubGlobal("fetch", withExportJobProtocol(fetchMock, (url) => url.startsWith(helperUrl + "/api/property-decks/export-jobs?id=")
      ? new Response(JSON.stringify({ status: "failed", error: "PDF validation failed: the exported file could not be opened.", progress: { stage: "validating", currentSlide: 4, totalSlides: 4, title: "Checking PDF" }, previews: [], checklist: [{ id: "pdf", label: "PDF opens", status: "failed" }] }), { status: 200 })
      : null));

    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());
    fireEvent.click(screen.getAllByRole("button", { name: /add this slide/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Export Proposal" }));

    expect((await screen.findByText("Required export checks failed. Downloads are blocked.")).getAttribute("role")).toBe("alert");
    expect(screen.queryByRole("button", { name: "Download PPTX" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Download PDF" })).toBeNull();
  });

  it("shows Mosaic slide thumbnails during assembly and only offers files after validation", async () => {
    let statusCalls = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `${helperUrl}/health`) return new Response(JSON.stringify({ ok: true }), { status: 200 });
      if (url === `${helperUrl}/api/property-decks` && (!init || init.method !== "POST")) {
        return new Response(JSON.stringify({ catalog: mockCatalog }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", withExportJobProtocol(fetchMock, () => {
      statusCalls += 1;
      if (statusCalls === 1) {
        return new Response(JSON.stringify({
          status: "assembling",
          progress: { stage: "assembling", currentSlide: 1, totalSlides: 4, title: "Cover page" },
          previews: [{ slide: 1, title: "Cover page", url: "/api/property-decks/export-preview?id=89a73bcb-ade6-4ee4-a353-45a1be034d49&slide=1" }],
          previewWarning: true,
          checklist: [],
        }), { status: 200 });
      }
      return null;
    }));

    render(<PropertyDecksView />);
    await waitFor(() => expect(screen.getByText("Biñan Logistics Center — Warehouse 4")).toBeDefined());
    fireEvent.click(screen.getAllByRole("button", { name: /add this slide/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Export Proposal" }));

    const exportButton = screen.getByRole("button", { name: /building/i });
    expect(exportButton.hasAttribute("disabled")).toBe(true);
    expect(await screen.findByAltText("Slide 1 preview: Cover page")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Download PPTX" })).toBeNull();
    await waitFor(() => expect(screen.getByText("PPTX and PDF passed the export checklist and are ready to download.")).toBeDefined());
    expect(screen.getByRole("button", { name: "Download PPTX" })).toBeDefined();
    expect(screen.getByText(/One cover and one final CTA/)).toBeDefined();
    expect(screen.getByText(/Some thumbnails could not render/)).toBeDefined();
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

    vi.stubGlobal("fetch", withExportJobProtocol(fetchMock));

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
    expect(screen.getByText("Selected Slides (4)")).toBeDefined();
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

    const locations = screen.getByRole("combobox", { name: "Filter by location" }) as HTMLSelectElement;
    expect(Array.from(locations.options).map((option) => option.textContent?.trim())).toEqual([
      "All locations",
      "Biñan",
      "Pasig",
    ]);
    expect(locations.querySelector("optgroup")).toBeNull();
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
    expect(reordered.findIndex((item) => item.includes("MSCS Pasig Distribution Hub"))).toBeLessThan(
      reordered.findIndex((item) => item.includes("Biñan Logistics Center")),
    );

    fireEvent.click(screen.getByRole("tab", { name: /CTA/ }));
    expect(screen.getByRole("tab", { name: /Properties/ }).getAttribute("aria-selected")).toBe("false");
    fireEvent.click(screen.getByRole("tab", { name: /Properties/ }));
    const propertyOrder = within(screen.getByRole("tabpanel")).getAllByRole("listitem").map((item) => item.textContent || "");
    expect(propertyOrder.findIndex((item) => item.includes("MSCS Pasig Distribution Hub"))).toBeLessThan(
      propertyOrder.findIndex((item) => item.includes("Biñan Logistics Center")),
    );
    expect(screen.getByText("Selected Slides (6)")).toBeDefined();
    fireEvent.click(within(screen.getByRole("tabpanel")).getByRole("button", { name: "Remove MSCS Pasig Distribution Hub" }));
    expect(screen.getByText("Selected Slides (4)")).toBeDefined();
    fireEvent.click(screen.getByRole("tab", { name: /CTA/ }));
    fireEvent.click(screen.getByRole("tab", { name: /Properties/ }));
    expect(within(screen.getByRole("tabpanel")).getAllByRole("listitem")).toHaveLength(2);
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
    expect(screen.getByText("One generated contact page is included in every proposal export.")).toBeDefined();
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
