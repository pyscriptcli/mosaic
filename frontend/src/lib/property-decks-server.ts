import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import JSZip from "jszip";
import {
  enrichDeckSlidesWithSharedWarehouseSpecs,
  extractSpecsFromSlideText,
  extractTextFromSlideXml,
  getOrderedSlidePathsFromZip,
  type CompilationManifest,
  type PropertyDeckCatalog,
  type PropertySlideItem,
} from "./property-decks";

const execFileAsync = promisify(execFile);

const CACHE_ROOT = process.env.VITEST
  ? path.join(os.tmpdir(), "mosaic-vitest-property-decks-cache")
  : path.join(process.cwd(), ".cache", "property-decks");
const THUMBNAILS_DIR = path.join(CACHE_ROOT, "thumbnails");
const CATALOG_CACHE_PATH = path.join(CACHE_ROOT, "catalog.json");
const SEED_CATALOG_PATH = path.join(process.cwd(), "src", "data", "property-decks-seed.json");

function resolveExistingFolderFuzzy(rawInput: string): string | null {
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  // Avoid treating Windows drive paths as relative paths on Linux containers
  if (process.platform !== "win32" && /^[a-zA-Z]:[\\/]/.test(trimmed)) {
    return null;
  }

  const direct = path.resolve(trimmed);
  if (fs.existsSync(direct)) return direct;

  // Walk segments and match collapsed whitespace (e.g., "CRD 2026 COMPILED" -> "CRD 2026  COMPILED")
  const parsed = path.parse(direct);
  if (!parsed.root || !fs.existsSync(parsed.root)) return null;

  const relativePart = direct.slice(parsed.root.length);
  const segments = relativePart.split(/[\\/]+/).filter(Boolean);
  let current = parsed.root;

  for (const seg of segments) {
    const exactNext = path.join(current, seg);
    if (fs.existsSync(exactNext)) {
      current = exactNext;
      continue;
    }
    try {
      const normSeg = seg.replace(/\s+/g, " ").toLowerCase();
      const entries = fs.readdirSync(current, { withFileTypes: true });
      const matched = entries.find(
        (e) => e.isDirectory() && e.name.replace(/\s+/g, " ").toLowerCase() === normSeg,
      );
      if (!matched) return null;
      current = path.join(current, matched.name);
    } catch {
      return null;
    }
  }

  return fs.existsSync(current) ? current : null;
}

export function readSeedCatalog(
  overrideSourceFolder?: string,
  overrideOutputFolder?: string,
): PropertyDeckCatalog | null {
  try {
    if (!fs.existsSync(SEED_CATALOG_PATH)) return null;
    const parsed = JSON.parse(fs.readFileSync(SEED_CATALOG_PATH, "utf-8")) as PropertyDeckCatalog;
    return {
      ...parsed,
      sourceFolder: overrideSourceFolder?.trim() || parsed.sourceFolder,
      outputFolder: overrideOutputFolder?.trim() || parsed.outputFolder,
    };
  } catch {
    return null;
  }
}

async function findPptxFiles(rootDir: string, maxFiles = 35): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string, depth: number) {
    if (results.length >= maxFiles || depth > 4) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (results.length >= maxFiles) break;
      if (entry.name.startsWith("~$") || entry.name.startsWith(".")) continue;
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (/node_modules|\.git|backup|old laptop backup/i.test(entry.name)) continue;
        await walk(fullPath, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".pptx")) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir, 0);
  return results;
}

async function extractSlideMediaThumbnail(
  zip: JSZip,
  slideNumber: number,
  slideIdHash: string,
): Promise<string | null> {
  const relsPath = `ppt/slides/_rels/slide${slideNumber}.xml.rels`;
  const relsFile = zip.file(relsPath);
  if (!relsFile) return null;

  const relsXml = await relsFile.async("string");
  const targetMatches = Array.from(
    relsXml.matchAll(/Target="\.\.\/media\/([^"]+\.(?:png|jpg|jpeg))"/gi),
  );
  if (targetMatches.length === 0) return null;

  let bestMediaPath: string | null = null;
  let bestSize = 0;

  for (const match of targetMatches) {
    const mediaName = match[1];
    const zipEntry = zip.file(`ppt/media/${mediaName}`);
    if (!zipEntry) continue;
    const data = await zipEntry.async("nodebuffer");
    if (data.byteLength > bestSize) {
      bestSize = data.byteLength;
      bestMediaPath = `ppt/media/${mediaName}`;
    }
  }

  if (!bestMediaPath || bestSize < 1500) return null;
  const mediaEntry = zip.file(bestMediaPath);
  if (!mediaEntry) return null;

  await fs.promises.mkdir(THUMBNAILS_DIR, { recursive: true });
  const ext = path.extname(bestMediaPath).toLowerCase() || ".png";
  const outPath = path.join(THUMBNAILS_DIR, `${slideIdHash}${ext}`);
  const buffer = await mediaEntry.async("nodebuffer");
  await fs.promises.writeFile(outPath, buffer);
  return outPath;
}

export async function scanOneDriveFolder(
  sourceFolder: string,
  outputFolder?: string,
  maxDecks = 35,
): Promise<PropertyDeckCatalog> {
  const resolvedSource = resolveExistingFolderFuzzy(sourceFolder);
  if (!resolvedSource) {
    const seed = readSeedCatalog(sourceFolder, outputFolder);
    if (seed) {
      return seed;
    }
    throw new Error(`OneDrive source folder not found: ${sourceFolder.trim()}`);
  }

  const resolvedOutput = outputFolder?.trim()
    ? resolveExistingFolderFuzzy(outputFolder) || path.resolve(outputFolder.trim())
    : path.join(resolvedSource, "Compiled Proposals");

  const pptxFiles = await findPptxFiles(resolvedSource, maxDecks);
  const slides: PropertySlideItem[] = [];
  let indexedDecksCount = 0;

  for (const filePath of pptxFiles) {
    if (filePath.startsWith(resolvedOutput)) continue;
    try {
      const buffer = await fs.promises.readFile(filePath);
      const zip = await JSZip.loadAsync(buffer);
      const slideFileNames = await getOrderedSlidePathsFromZip(zip);

      if (slideFileNames.length === 0) continue;
      indexedDecksCount += 1;

      const deckFileName = path.basename(filePath);
      const deckDir = path.dirname(filePath);
      const deckFolderName = path.basename(deckDir);
      const deckSlug = deckFolderName.toLowerCase().replace(/\s+/g, "_");
      const deckId = crypto.createHash("sha1").update(deckFileName).digest("hex").slice(0, 10);
      const deckSlides: PropertySlideItem[] = [];

      for (let idx = 0; idx < slideFileNames.length; idx += 1) {
        const slideXmlPath = slideFileNames[idx];
        const xmlSlideNumber = Number(slideXmlPath.match(/slide(\d+)\.xml/i)?.[1] || idx + 1);
        const slideNumber = idx + 1;
        const xmlFile = zip.file(slideXmlPath);
        if (!xmlFile) continue;

        const xmlContent = await xmlFile.async("string");
        const rawText = extractTextFromSlideXml(xmlContent);
        if (!rawText.trim()) continue;

        const extracted = extractSpecsFromSlideText(rawText, deckFileName);
        const slideId = `${deckId}:slide:${slideNumber}`;
        const slideIdHash = `${deckId}_s${slideNumber}`;

        const publicPreviewRel = `/property-decks/previews/${deckSlug}_s${slideNumber}.jpg`;
        const publicPreviewFile = path.join(
          process.cwd(),
          "public",
          "property-decks",
          "previews",
          `${deckSlug}_s${slideNumber}.jpg`,
        );
        const localPreviewPng = path.join(
          deckDir,
          "previews",
          `slide_${String(slideNumber).padStart(2, "0")}.png`,
        );

        let thumbnailUrl = `/api/property-decks/thumbnail?id=${encodeURIComponent(slideId)}`;
        if (fs.existsSync(publicPreviewFile)) {
          thumbnailUrl = publicPreviewRel;
        } else if (fs.existsSync(localPreviewPng)) {
          await fs.promises.mkdir(THUMBNAILS_DIR, { recursive: true });
          const outPath = path.join(THUMBNAILS_DIR, `${slideIdHash}.png`);
          await fs.promises.copyFile(localPreviewPng, outPath).catch(() => null);
        } else {
          await extractSlideMediaThumbnail(zip, xmlSlideNumber, slideIdHash).catch(() => null);
        }

        deckSlides.push({
          id: slideId,
          deckId,
          deckFileName,
          deckFilePath: filePath,
          slideNumber,
          slideRole: extracted.slideRole,
          title: extracted.title,
          rawText,
          thumbnailUrl,
          specs: extracted.specs,
        });
      }

      slides.push(...enrichDeckSlidesWithSharedWarehouseSpecs(deckSlides));
    } catch {
      // Skip unreadable or corrupted PPTX archives cleanly
    }
  }

  const catalog: PropertyDeckCatalog = {
    sourceFolder: resolvedSource,
    outputFolder: resolvedOutput,
    indexedAt: new Date().toISOString(),
    decksCount: indexedDecksCount,
    slides,
  };

  await fs.promises.mkdir(CACHE_ROOT, { recursive: true }).catch(() => null);
  await fs.promises
    .writeFile(CATALOG_CACHE_PATH, JSON.stringify(catalog, null, 2), "utf-8")
    .catch(() => null);

  return catalog;
}

export async function readCachedCatalog(): Promise<PropertyDeckCatalog | null> {
  try {
    if (fs.existsSync(CATALOG_CACHE_PATH)) {
      const content = await fs.promises.readFile(CATALOG_CACHE_PATH, "utf-8");
      const parsed = JSON.parse(content) as PropertyDeckCatalog;
      if (parsed?.slides?.length) return parsed;
    }
  } catch {
    // Fallback to seed catalog
  }
  return readSeedCatalog();
}

export async function resolveSlideThumbnailFile(slideId: string): Promise<string | null> {
  const safePrefix = slideId.replace(":slide:", "_s").replace(/[^a-zA-Z0-9_-]/g, "");
  for (const ext of [".png", ".jpg", ".jpeg"]) {
    const candidate = path.join(THUMBNAILS_DIR, `${safePrefix}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export async function compilePropertyDeck(params: {
  manifest: CompilationManifest;
  outputFolder: string;
}): Promise<{ outputPath: string; fileName: string; slideCount: number; engine: string }> {
  const rawOutput = params.outputFolder.trim();
  const isCrossPlatformUnavailable =
    process.platform !== "win32" && /^[a-zA-Z]:[\\/]/.test(rawOutput);

  let resolvedOutputFolder: string;
  if (isCrossPlatformUnavailable) {
    resolvedOutputFolder = path.join(os.tmpdir(), "mosaic-compiled-proposals");
  } else {
    const parentResolved = resolveExistingFolderFuzzy(path.dirname(rawOutput));
    resolvedOutputFolder = parentResolved
      ? path.join(parentResolved, path.basename(rawOutput))
      : path.resolve(rawOutput);
  }
  await fs.promises.mkdir(resolvedOutputFolder, { recursive: true });

  const safeClient = (params.manifest.proposal.clientName || "Client")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const modeLabel = params.manifest.mode === "comprehensive" ? "Comprehensive" : "Standard";
  const datePart = (params.manifest.proposal.date || new Date().toISOString().slice(0, 10)).replace(
    /[^0-9-]/g,
    "",
  );
  const fileName = `PRIME_Proposal_${safeClient}_${modeLabel}_${datePart}.pptx`;
  const outputPath = path.join(resolvedOutputFolder, fileName);

  const enrichedSlides = await Promise.all(
    params.manifest.slides.map(async (slide) => {
      const localThumbnailPath = await resolveSlideThumbnailFile(slide.id);
      return { ...slide, localThumbnailPath };
    }),
  );

  const enrichedManifest = {
    ...params.manifest,
    slides: enrichedSlides,
  };

  const tempManifestPath = path.join(
    os.tmpdir(),
    `mosaic-deck-manifest-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  await fs.promises.writeFile(tempManifestPath, JSON.stringify(enrichedManifest, null, 2), "utf-8");

  const scriptPath = path.join(process.cwd(), "scripts", "property_decks", "pptx_engine.py");

  try {
    if (fs.existsSync(scriptPath)) {
      const { stdout } = await execFileAsync("python", [
        scriptPath,
        "compile",
        tempManifestPath,
        outputPath,
      ]);
      const parsed = JSON.parse(stdout.trim());
      return {
        outputPath,
        fileName,
        slideCount: Number(parsed.slideCount || params.manifest.slides.length + 2),
        engine: String(parsed.engine || "python-pptx"),
      };
    }
  } catch {
    // Fallback to pure JSZip OpenXML compilation if Python fails
  } finally {
    await fs.promises.rm(tempManifestPath, { force: true }).catch(() => null);
  }

  const zip = new JSZip();
  const allSlideTexts: string[] = [
    `PRIME PHILIPPINES PROPOSAL FOR ${params.manifest.proposal.clientName}`,
  ];
  if (params.manifest.includeSummaryTable) {
    allSlideTexts.push(
      `EXECUTIVE SUMMARY TABLE (${params.manifest.comparisonRows.length} OPTIONS)`,
    );
  }
  for (const s of params.manifest.slides) {
    allSlideTexts.push(`${s.title} - ${s.specs.location} - ${s.specs.gla} - ${s.specs.leaseRate}`);
  }
  if (params.manifest.includeCredentials) {
    allSlideTexts.push("PRIME PHILIPPINES INDUSTRIAL CREDENTIALS");
  }
  allSlideTexts.push("THANK YOU & CONTACT INFORMATION");

  allSlideTexts.forEach((text, i) => {
    zip.file(
      `ppt/slides/slide${i + 1}.xml`,
      `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><a:t>${text}</a:t></p:sld>`,
    );
  });

  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  await fs.promises.writeFile(outputPath, buffer);

  return {
    outputPath,
    fileName,
    slideCount: allSlideTexts.length,
    engine: "jszip-fallback",
  };
}
