import path from "node:path";
import { NextResponse } from "next/server";
import {
  buildCompilationManifest,
  type DeckCompilationMode,
  type PitchProposalDetails,
  type PropertySlideItem,
  type PropertySlideOverride,
} from "@/lib/property-decks";
import { compilePropertyDeck, convertPropertyDeckPdf, readCachedCatalog } from "@/lib/property-decks-server";
import { getPropertyDeckPptxPath, readPropertyDeckExport, registerPropertyDeckExport, setPropertyDeckPdf } from "@/lib/property-deck-downloads";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const format = searchParams.get("format");
  if (!/^[a-f0-9-]{36}$/i.test(id) || (format !== "pptx" && format !== "pdf")) {
    return NextResponse.json({ error: "Export download is invalid or expired." }, { status: 400 });
  }

  const file = await readPropertyDeckExport(id, format);
  if (!file) {
    return NextResponse.json({ error: "This export file is unavailable or has expired." }, { status: 404 });
  }
  return new NextResponse(new Uint8Array(file.content), {
    headers: {
      "Content-Type": format === "pptx"
        ? "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        : "application/pdf",
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function PUT(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const downloadId = String(body.downloadId || "");
    if (!/^[a-f0-9-]{36}$/i.test(downloadId)) {
      return NextResponse.json({ error: "Export session is invalid or expired." }, { status: 404 });
    }
    const pptxPath = getPropertyDeckPptxPath(downloadId);
    if (!pptxPath) return NextResponse.json({ error: "Export session is invalid or expired." }, { status: 404 });
    const pdf = await convertPropertyDeckPdf(pptxPath);
    setPropertyDeckPdf(downloadId, pdf.pdfPath);
    return NextResponse.json(pdf);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "PDF conversion failed." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const selectedSlideIds: string[] = Array.isArray(body.selectedSlideIds)
      ? body.selectedSlideIds.map(String)
      : [];

    if (selectedSlideIds.length === 0) {
      return NextResponse.json(
        { error: "Select at least one property slide to compile a proposal." },
        { status: 400 },
      );
    }

    const cached = await readCachedCatalog();
    const catalogSlides: PropertySlideItem[] = cached?.slides || [];

    const overrides: Record<string, PropertySlideOverride> =
      body.overrides && typeof body.overrides === "object" ? body.overrides : {};

    const rawProposal = body.proposal || {};
    const mode: DeckCompilationMode =
      rawProposal.mode === "comprehensive" ? "comprehensive" : "standard";

    const proposal: PitchProposalDetails = {
      clientName: String(rawProposal.clientName || "Valued Client").trim(),
      clientDesignation: String(rawProposal.clientDesignation || "").trim(),
      clientCompany: String(rawProposal.clientCompany || "").trim(),
      preparedByName: String(rawProposal.preparedByName || "").trim(),
      preparedByDesignation: String(rawProposal.preparedByDesignation || "").trim(),
      preparedByCompany: String(rawProposal.preparedByCompany || "").trim(),
      clientLogoDataUrl: typeof rawProposal.clientLogoDataUrl === "string" ? rawProposal.clientLogoDataUrl : "",
      projectTitle: String(
        rawProposal.projectTitle || "Industrial Warehouse Property Options",
      ).trim(),
      brokerName: String(rawProposal.brokerName || "PRIME Industrial Advisory").trim(),
      brokerEmail: String(rawProposal.brokerEmail || "industrial@primephilippines.com").trim(),
      brokerPhone: String(rawProposal.brokerPhone || "+63 2 8888 0000").trim(),
      date: String(rawProposal.date || new Date().toISOString().slice(0, 10)).trim(),
      mode,
    };

    const outputFolder =
      String(body.outputFolder || "").trim() ||
      cached?.outputFolder ||
      (cached?.sourceFolder ? path.join(cached.sourceFolder, "Compiled Proposals") : "");

    if (!outputFolder) {
      return NextResponse.json(
        { error: "Configure an output folder path before compiling." },
        { status: 400 },
      );
    }

    const manifest = buildCompilationManifest({
      selectedSlideIds,
      catalogSlides,
      overrides,
      proposal,
    });

    if (manifest.slides.length === 0) {
      return NextResponse.json(
        { error: "Selected slides could not be resolved in the current catalog." },
        { status: 400 },
      );
    }

    const result = await compilePropertyDeck({
      manifest,
      outputFolder,
    });
    const downloadId = registerPropertyDeckExport(result.outputPath, null);

    return NextResponse.json({
      ...result,
      pdfError: null,
      downloadId,
      manifest,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compile presentation deck." },
      { status: 500 },
    );
  }
}
