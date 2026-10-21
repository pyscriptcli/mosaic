import path from "node:path";
import { NextResponse } from "next/server";
import {
  buildCompilationManifest,
  type DeckCompilationMode,
  type PitchProposalDetails,
  type PropertySlideItem,
  type PropertySlideOverride,
} from "@/lib/property-decks";
import { compilePropertyDeck, readCachedCatalog } from "@/lib/property-decks-server";

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

    return NextResponse.json({
      ...result,
      manifest,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to compile presentation deck." },
      { status: 500 },
    );
  }
}
