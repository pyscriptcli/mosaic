import JSZip from "jszip";
import { getOrderedSlidePathsFromZip, type BrowserPptxFileInput, type CompilationManifest } from "@/lib/property-decks";

const REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";

function normalizePackagePath(value: string): string {
  const parts: string[] = [];
  for (const part of value.replace(/\\/g, "/").split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function packageDirectory(value: string): string {
  const index = value.lastIndexOf("/");
  return index < 0 ? "" : value.slice(0, index);
}

function relativePackagePath(fromDirectory: string, toPath: string): string {
  const from = fromDirectory ? fromDirectory.split("/") : [];
  const to = toPath.split("/");
  while (from.length && to.length && from[0] === to[0]) {
    from.shift();
    to.shift();
  }
  return [...from.map(() => ".."), ...to].join("/");
}

function relationshipsPath(partPath: string): string {
  const directory = packageDirectory(partPath);
  const name = partPath.slice(directory ? directory.length + 1 : 0);
  return `${directory ? `${directory}/` : ""}_rels/${name}.rels`;
}

function relationshipTargetPath(sourcePartPath: string, target: string): string {
  if (target.startsWith("/")) return normalizePackagePath(target);
  return normalizePackagePath(`${packageDirectory(sourcePartPath)}/${target}`);
}

function relationshipContentType(contentTypesXml: string, partPath: string): string | null {
  const escaped = partPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = contentTypesXml.match(
    new RegExp(`<Override\\b(?=[^>]*\\bPartName="/${escaped}")[^>]*\\bContentType="([^"]+)"[^>]*/?>`, "i"),
  );
  return match?.[1] || null;
}

function ensureContentType(contentTypesXml: string, partPath: string, contentType: string | null): string {
  if (!contentType || relationshipContentType(contentTypesXml, partPath)) return contentTypesXml;
  return contentTypesXml.replace(
    /<\/Types>/i,
    `<Override PartName="/${partPath}" ContentType="${contentType}"/></Types>`,
  );
}

function mergeContentTypeDefaults(targetXml: string, sourceXml: string): string {
  const knownExtensions = new Set(
    [...targetXml.matchAll(/<Default\b[^>]*\bExtension="([^"]+)"/gi)].map((match) => match[1].toLowerCase()),
  );
  const additions = [...sourceXml.matchAll(/<Default\b[^>]*\/>/gi)]
    .map((match) => match[0])
    .filter((tag) => {
      const extension = tag.match(/\bExtension="([^"]+)"/i)?.[1].toLowerCase();
      if (!extension || knownExtensions.has(extension)) return false;
      knownExtensions.add(extension);
      return true;
    });
  return additions.length ? targetXml.replace(/<\/Types>/i, `${additions.join("")}</Types>`) : targetXml;
}

function nextRelationshipId(xml: string): number {
  let max = 0;
  for (const match of xml.matchAll(/\bId="rId(\d+)"/g)) max = Math.max(max, Number(match[1]));
  return max + 1;
}

async function copySlideParts(
  source: JSZip,
  sourcePartPath: string,
  destinationPartPath: string,
  output: JSZip,
  slideIndex: number,
  visited = new Map<string, string>(),
  nextDependency = { value: 0 },
  copiedMasters = new Set<string>(),
): Promise<void> {
  if (visited.has(sourcePartPath)) return;
  visited.set(sourcePartPath, destinationPartPath);

  const entry = source.file(sourcePartPath);
  if (!entry) throw new Error(`Selected slide is missing ${sourcePartPath}.`);
  output.file(destinationPartPath, await entry.async("uint8array"));

  const sourceRelsPath = relationshipsPath(sourcePartPath);
  const relsEntry = source.file(sourceRelsPath);
  if (!relsEntry) return;

  const [sourceRelsXml, sourceContentTypes] = await Promise.all([
    relsEntry.async("string"),
    source.file("[Content_Types].xml")?.async("string") || Promise.resolve(""),
  ]);
  let destinationRelsXml = sourceRelsXml;
  const relationshipTags = [...sourceRelsXml.matchAll(/<Relationship\b[^>]*\/?\s*>/gi)];

  for (const relationshipTag of relationshipTags) {
    const tag = relationshipTag[0];
    const targetMatch = tag.match(/\bTarget="([^"]+)"/i);
    if (!targetMatch || /\bTargetMode="External"/i.test(tag)) continue;

    const sourceTargetPath = relationshipTargetPath(sourcePartPath, targetMatch[1]);
    let destinationTargetPath = visited.get(sourceTargetPath);
    if (!destinationTargetPath) {
      const targetName = sourceTargetPath.split("/").pop() || "part.xml";
      destinationTargetPath = `ppt/selected/slide${slideIndex}/assets/${nextDependency.value++}-${targetName}`;
      await copySlideParts(
        source,
        sourceTargetPath,
        destinationTargetPath,
        output,
        slideIndex,
        visited,
        nextDependency,
        copiedMasters,
      );
    }
    if (/\/relationships\/slideMaster$/i.test(tag.match(/\bType="([^"]+)"/i)?.[1] || "")) {
      copiedMasters.add(destinationTargetPath);
    }

    const destinationTarget = relativePackagePath(
      packageDirectory(destinationPartPath),
      destinationTargetPath,
    );
    destinationRelsXml = destinationRelsXml.replace(
      tag,
      tag.replace(targetMatch[0], `Target="${destinationTarget}"`),
    );

    let contentTypesXml = (await output.file("[Content_Types].xml")?.async("string")) || sourceContentTypes;
    const overrideType = relationshipContentType(sourceContentTypes, sourceTargetPath);
    contentTypesXml = ensureContentType(contentTypesXml, destinationTargetPath, overrideType);
    if (contentTypesXml) output.file("[Content_Types].xml", contentTypesXml);
  }

  output.file(relationshipsPath(destinationPartPath), destinationRelsXml);
}

async function makeCopiedSlideDeck(
  manifest: CompilationManifest,
  sourceFiles: ReadonlyMap<string, BrowserPptxFileInput>,
): Promise<{ blob: Blob; buffer: Uint8Array; fileName: string; slideCount: number }> {
  if (manifest.slides.length === 0) throw new Error("Select at least one slide to export.");

  const loaded = new Map<string, JSZip>();
  const getSourceZip = async (deckFilePath: string): Promise<JSZip> => {
    const known = loaded.get(deckFilePath);
    if (known) return known;
    const source = sourceFiles.get(deckFilePath);
    if (!source) throw new Error(`The original deck is unavailable: ${deckFilePath}`);
    const zip = await JSZip.loadAsync(source.data);
    loaded.set(deckFilePath, zip);
    return zip;
  };

  const firstSource = await getSourceZip(manifest.slides[0].deckFilePath);
  const baseBytes = await firstSource.generateAsync({ type: "uint8array" });
  const output = await JSZip.loadAsync(baseBytes);
  let presentationXml = await output.file("ppt/presentation.xml")?.async("string");
  let presentationRelsXml = await output.file("ppt/_rels/presentation.xml.rels")?.async("string");

  if (!presentationXml || !presentationRelsXml) {
    throw new Error("The selected source deck is missing its PowerPoint presentation manifest.");
  }

  const newSlideIds: string[] = [];
  const copiedMasters = new Set<string>();
  let nextRelId = nextRelationshipId(presentationRelsXml);
  const slideRelationshipType = `${REL_NS}/slide`;
  presentationRelsXml = presentationRelsXml.replace(
    /<Relationship\b[^>]*\/>/gi,
    (tag) => (/\/relationships\/slide"/i.test(tag) ? "" : tag),
  );

  for (const [index, slide] of manifest.slides.entries()) {
    const source = await getSourceZip(slide.deckFilePath);
    const sourceContentTypes = (await source.file("[Content_Types].xml")?.async("string")) || "";
    const outputContentTypes = (await output.file("[Content_Types].xml")?.async("string")) || "";
    output.file("[Content_Types].xml", mergeContentTypeDefaults(outputContentTypes, sourceContentTypes));
    const orderedSlidePaths = await getOrderedSlidePathsFromZip(source);
    const sourceSlidePath = orderedSlidePaths[slide.slideNumber - 1];
    if (!sourceSlidePath) {
      throw new Error(`Slide ${slide.slideNumber} was not found in ${slide.deckFileName}.`);
    }

    const destinationSlidePath = `ppt/slides/slide${index + 1}.xml`;
    await copySlideParts(source, sourceSlidePath, destinationSlidePath, output, index + 1, new Map(), { value: 0 }, copiedMasters);
    const slideContentType = relationshipContentType(sourceContentTypes, sourceSlidePath);
    const outputTypes = (await output.file("[Content_Types].xml")?.async("string")) || "";
    output.file(
      "[Content_Types].xml",
      ensureContentType(outputTypes, destinationSlidePath, slideContentType),
    );

    const relId = `rId${nextRelId++}`;
    newSlideIds.push(`<p:sldId id="${256 + index}" r:id="${relId}"/>`);
    presentationRelsXml = presentationRelsXml.replace(
      /<\/Relationships>/i,
      `<Relationship Id="${relId}" Type="${slideRelationshipType}" Target="slides/slide${index + 1}.xml"/></Relationships>`,
    );
  }

  const newMasterIds: string[] = [];
  for (const [index, masterPath] of [...copiedMasters].entries()) {
    const relId = `rId${nextRelId++}`;
    newMasterIds.push(`<p:sldMasterId id="${2147483649 + index}" r:id="${relId}"/>`);
    presentationRelsXml = presentationRelsXml.replace(
      /<\/Relationships>/i,
      `<Relationship Id="${relId}" Type="${REL_NS}/slideMaster" Target="${relativePackagePath("ppt", masterPath)}"/></Relationships>`,
    );
  }

  presentationXml = presentationXml.replace(
    /<p:sldIdLst>[\s\S]*?<\/p:sldIdLst>/i,
    `<p:sldIdLst>${newSlideIds.join("")}</p:sldIdLst>`,
  );
  if (newMasterIds.length) {
    presentationXml = presentationXml.replace(
      /<p:sldMasterIdLst>([\s\S]*?)<\/p:sldMasterIdLst>/i,
      (list) => list.replace("</p:sldMasterIdLst>", `${newMasterIds.join("")}</p:sldMasterIdLst>`),
    );
  }
  output.file("ppt/presentation.xml", presentationXml);
  output.file("ppt/_rels/presentation.xml.rels", presentationRelsXml);

  const safeClient = (manifest.proposal.clientName || "Client")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const datePart = (manifest.proposal.date || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, "");
  const fileName = `PRIME_Proposal_${safeClient}_${datePart}.pptx`;
  const buffer = await output.generateAsync({ type: "uint8array" });
  const blobBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
  return {
    blob: new Blob([blobBuffer], {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
    buffer,
    fileName,
    slideCount: manifest.slides.length,
  };
}

export async function compileCopiedPptx(
  manifest: CompilationManifest,
  sourceFiles: ReadonlyMap<string, BrowserPptxFileInput>,
) {
  return makeCopiedSlideDeck(manifest, sourceFiles);
}
