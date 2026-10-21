import fs from "node:fs";
import { NextResponse } from "next/server";
import { readCachedCatalog, scanOneDriveFolder } from "@/lib/property-decks-server";

const DEFAULT_SUGGESTED_FOLDER =
  "C:\\Users\\PRIME_Dave\\OneDrive - Jet Innovisions\\Sondi Tuazon's files - CRD 2026  COMPILED ONE DRIVE\\Industrial\\Property Deck\\Converted";
const DEFAULT_OUTPUT_FOLDER =
  "C:\\Users\\PRIME_Dave\\OneDrive - Jet Innovisions\\Sondi Tuazon's files - CRD 2026  COMPILED ONE DRIVE\\Industrial\\Property Deck\\Proposals";

export async function GET() {
  try {
    let catalog = await readCachedCatalog();
    if (
      (!catalog || !catalog.sourceFolder || !fs.existsSync(catalog.sourceFolder)) &&
      fs.existsSync(DEFAULT_SUGGESTED_FOLDER)
    ) {
      catalog = await scanOneDriveFolder(DEFAULT_SUGGESTED_FOLDER, DEFAULT_OUTPUT_FOLDER, 35);
    }
    return NextResponse.json({
      catalog,
      suggestedDefaultFolder: DEFAULT_SUGGESTED_FOLDER,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load Property Decks catalog." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const sourceFolder = String(body.sourceFolder || "").trim();
    const outputFolder = String(body.outputFolder || "").trim() || undefined;
    const maxDecks = typeof body.maxDecks === "number" ? body.maxDecks : 35;

    if (!sourceFolder) {
      return NextResponse.json(
        { error: "Provide a valid local OneDrive source folder path." },
        { status: 400 },
      );
    }

    const catalog = await scanOneDriveFolder(sourceFolder, outputFolder, maxDecks);
    return NextResponse.json({ catalog });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to index OneDrive folder." },
      { status: 400 },
    );
  }
}
