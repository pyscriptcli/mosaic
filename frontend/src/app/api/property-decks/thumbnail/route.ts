import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { readCachedCatalog, resolveSlideThumbnailFile } from "@/lib/property-decks-server";

function escapeSvg(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";

  if (id) {
    const filePath = await resolveSlideThumbnailFile(id);
    if (filePath && fs.existsSync(filePath)) {
      const ext = path.extname(filePath).toLowerCase();
      const mimeType = ext === ".png" ? "image/png" : "image/jpeg";
      const buffer = await fs.promises.readFile(filePath);
      return new NextResponse(buffer, {
        headers: {
          "Content-Type": mimeType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  }

  const catalog = await readCachedCatalog();
  const slide = catalog?.slides.find((item) => item.id === id);

  const title = escapeSvg((slide?.title || "PRIME Industrial Property").slice(0, 48));
  const location = escapeSvg((slide?.specs.location || "Industrial Corridor").slice(0, 42));
  const gla = escapeSvg((slide?.specs.gla || "Upon Request").slice(0, 26));
  const rate = escapeSvg((slide?.specs.leaseRate || "Upon Request").slice(0, 26));
  const height = escapeSvg((slide?.specs.ceilingHeight || "Standard").slice(0, 26));
  const deckName = escapeSvg((slide?.deckFileName || "Master Deck").slice(0, 44));
  const slideNo = slide?.slideNumber || 1;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
    <rect width="640" height="360" fill="#FFFCFB" />
    <rect width="640" height="68" fill="#003366" />
    <rect y="68" width="640" height="4" fill="#C9A84C" />
    <text x="24" y="26" fill="#C9A84C" font-family="Montserrat, sans-serif" font-size="10" font-weight="700" letter-spacing="1.5">PRIME PHILIPPINES · SLIDE #${slideNo}</text>
    <text x="24" y="50" fill="#FFFCFB" font-family="Montserrat, sans-serif" font-size="16" font-weight="700">${title}</text>
    <rect x="24" y="92" width="280" height="224" fill="#F8FAFC" stroke="#E2E8F0" />
    <text x="40" y="122" fill="#31577D" font-family="Montserrat, sans-serif" font-size="10" font-weight="700">LOCATION</text>
    <text x="40" y="142" fill="#003366" font-family="Montserrat, sans-serif" font-size="13" font-weight="600">${location}</text>
    <text x="40" y="178" fill="#31577D" font-family="Montserrat, sans-serif" font-size="10" font-weight="700">LEASABLE AREA (GLA)</text>
    <text x="40" y="198" fill="#003366" font-family="Montserrat, sans-serif" font-size="14" font-weight="700">${gla}</text>
    <text x="40" y="234" fill="#31577D" font-family="Montserrat, sans-serif" font-size="10" font-weight="700">ASKING RATE</text>
    <text x="40" y="254" fill="#003366" font-family="Montserrat, sans-serif" font-size="13" font-weight="700">${rate}</text>
    <text x="40" y="290" fill="#64748B" font-family="Montserrat, sans-serif" font-size="11">Clear Height: ${height}</text>
    <rect x="324" y="92" width="292" height="224" fill="#003366" fill-opacity="0.05" stroke="#C9A84C" stroke-dasharray="4 4" />
    <text x="470" y="195" text-anchor="middle" fill="#003366" font-family="Montserrat, sans-serif" font-size="12" font-weight="700">16:9 PROPERTY SLIDE</text>
    <text x="470" y="218" text-anchor="middle" fill="#64748B" font-family="Montserrat, sans-serif" font-size="10">${deckName}</text>
  </svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "no-store",
    },
  });
}
