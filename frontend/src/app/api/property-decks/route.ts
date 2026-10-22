import { NextResponse } from "next/server";
import { readCachedCatalog, scanPropertyDeckFolder } from "@/lib/property-decks-server";

export async function GET() {
  try {
    const catalog = await readCachedCatalog();
    return NextResponse.json({ catalog });
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
        { error: "Provide a valid local source folder path." },
        { status: 400 },
      );
    }

    const catalog = await scanPropertyDeckFolder(sourceFolder, outputFolder, maxDecks);
    return NextResponse.json({ catalog });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to index the local folder." },
      { status: 400 },
    );
  }
}
