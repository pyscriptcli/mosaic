import JSZip from "jszip";
import { cityNameFromLocation, extractTextFromSlideXml, getOrderedSlidePathsFromZip, isIndustrialFacilityProposalSlide, type CompilationManifest, type ProposalContact, type PptxSourceFile } from "@/lib/property-decks";

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

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXml(value).replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function contactImageAsset(dataUrl: string | undefined): { extension: string; contentType: string; bytes: Buffer } | null {
  const match = dataUrl?.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const extension = match[1].toLowerCase() === "png" ? "png" : "jpg";
  return {
    extension,
    contentType: extension === "png" ? "image/png" : "image/jpeg",
    bytes: Buffer.from(match[2], "base64"),
  };
}

function imageCropRect(bytes: Buffer, extension: string): { left: number; top: number; right: number; bottom: number } {
  let width = 1;
  let height = 1;
  if (extension === "png" && bytes.length >= 24) {
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else if (extension === "jpg") {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const segmentLength = bytes.readUInt16BE(offset + 2);
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        height = bytes.readUInt16BE(offset + 5);
        width = bytes.readUInt16BE(offset + 7);
        break;
      }
      offset += 2 + segmentLength;
    }
  }
  if (!width || !height) return { left: 0, top: 0, right: 0, bottom: 0 };
  if (width > height) {
    const crop = Math.round(((width - height) / width) * 50_000);
    return { left: crop, top: 0, right: crop, bottom: 0 };
  }
  const crop = Math.round(((height - width) / height) * 50_000);
  return { left: 0, top: crop, right: 0, bottom: crop };
}

function contactTextShape(
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
  paragraphs: Array<{ text: string; size: number; color: string; bold?: boolean; italic?: boolean }>,
  fontFamily = "Arial",
): string {
  const runs = paragraphs.map(({ text, size, color, bold, italic }) =>
    `<a:p><a:pPr/><a:r><a:rPr lang="en-US" sz="${size}" b="${bold ? 1 : 0}" i="${italic ? 1 : 0}" dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="${escapeXmlAttribute(fontFamily)}"/></a:rPr><a:t>${escapeXml(text)}</a:t></a:r><a:endParaRPr lang="en-US" sz="${size}"/></a:p>`,
  ).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Contact text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" rIns="0" tIns="0" bIns="0"/><a:lstStyle/>${runs}</p:txBody></p:sp>`;
}

function contactAvatarShape(contact: ProposalContact, id: number, x: number, y: number, relId?: string): string {
  if (relId) {
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${escapeXmlAttribute(contact.name)} portrait"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${relId}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="900000" cy="900000"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:ln w="12700"><a:solidFill><a:srgbClr val="C9A84C"/></a:solidFill></a:ln></p:spPr></p:pic>`;
  }
  const initials = contact.name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXmlAttribute(contact.name)} initials"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="900000" cy="900000"/></a:xfrm><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="003366"/></a:solidFill><a:ln w="12700"><a:solidFill><a:srgbClr val="C9A84C"/></a:solidFill></a:ln></p:spPr></p:sp><p:sp><p:nvSpPr><p:cNvPr id="${id + 1}" name="${escapeXmlAttribute(contact.name)} initials label"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y + 330000}"/><a:ext cx="900000" cy="250000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="none" lIns="0" rIns="0" tIns="0" bIns="0"/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="en-US" sz="1400" b="1"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:latin typeface="Arial"/></a:rPr><a:t>${escapeXml(initials)}</a:t></a:r><a:endParaRPr lang="en-US" sz="1400"/></a:p></p:txBody></p:sp>`;
}

async function appendContactSlide(output: JSZip, contacts: ProposalContact[]): Promise<void> {
  const presentationXml = await output.file("ppt/presentation.xml")?.async("string");
  const presentationRelsXml = await output.file("ppt/_rels/presentation.xml.rels")?.async("string");
  const contentTypesXml = await output.file("[Content_Types].xml")?.async("string");
  if (!presentationXml || !presentationRelsXml || !contentTypesXml) {
    throw new Error("The PowerPoint package is missing presentation metadata required to add CTA contacts.");
  }

  const slideIds = [...presentationXml.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"[^>]*\br:id="([^"]+)"[^>]*\/>/gi)];
  if (!slideIds.length) throw new Error("The PowerPoint presentation has no slides to attach CTA contacts to.");
  const lastSlideTarget = presentationRelsXml.match(new RegExp(`<Relationship\\b(?=[^>]*\\bId="${slideIds.at(-1)?.[2]}")(?=[^>]*\\bType="[^"]*\\/slide")[^>]*\\bTarget="([^"]+)"[^>]*/?>`, "i"))?.[1];
  const lastSlidePath = lastSlideTarget ? normalizePackagePath(`ppt/${lastSlideTarget}`) : "ppt/slides/slide1.xml";
  const sourceSlideRels = await output.file(relationshipsPath(lastSlidePath))?.async("string");
  const sourceLayoutTarget = sourceSlideRels?.match(/<Relationship\b(?=[^>]*\bType="[^"]*\/slideLayout")[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/i)?.[1];
  if (!sourceLayoutTarget) throw new Error("The final PowerPoint slide is missing its layout relationship; CTA contacts could not be added.");

  const nextSlideNumber = Math.max(...slideIds.map((match) => Number(match[1]))) - 255 + 1;
  const slidePath = `ppt/slides/slide${nextSlideNumber}.xml`;
  const relsPath = relationshipsPath(slidePath);
  const layoutPath = relationshipTargetPath(lastSlidePath, sourceLayoutTarget);
  const layoutTarget = relativePackagePath(packageDirectory(slidePath), layoutPath);
  const nextRelId = nextRelationshipId(presentationRelsXml);
  const nextSlideId = Math.max(...slideIds.map((match) => Number(match[1]))) + 1;
  const slideWidth = Number(presentationXml.match(/<p:presentation\b[^>]*>[\s\S]*?<p:sldSz\b[^>]*\bcx="(\d+)"/)?.[1] || 12192000);
  const slideHeight = Number(presentationXml.match(/<p:presentation\b[^>]*>[\s\S]*?<p:sldSz\b[^>]*\bcy="(\d+)"/)?.[1] || 6858000);
  const contentStartX = 900000;
  const contentWidth = slideWidth - contentStartX * 2;
  const columns = contacts.length > 1 ? 2 : 1;
  const rows = Math.ceil(contacts.length / columns);
  const cardWidth = columns === 1 ? contentWidth : Math.floor((contentWidth - 500000) / 2);
  const top = Math.max(1600000, Math.floor((slideHeight - rows * 1500000) / 2));
  let shapeId = 2;
  let relationshipId = 2;
  const contactShapes: string[] = [];
  const imageRelationships: string[] = [];
  const imageContentTypes: Array<{ path: string; contentType: string }> = [];
  for (const [index, contact] of contacts.entries()) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const x = contentStartX + column * (cardWidth + 500000);
    const y = top + row * 1500000;
    const image = contactImageAsset(contact.photoDataUrl);
    const contactRelId = image ? `rIdContact${relationshipId++}` : undefined;
    if (image && contactRelId) {
      const imagePath = `ppt/media/proposal-contact-${index + 1}.${image.extension}`;
      output.file(imagePath, image.bytes);
      const crop = imageCropRect(image.bytes, image.extension);
      const path = imagePath.replaceAll("&", "&amp;");
      imageRelationships.push(`<Relationship Id="${contactRelId}" Type="${REL_NS}/image" Target="../media/proposal-contact-${index + 1}.${image.extension}"/>`);
      imageContentTypes.push({ path, contentType: image.contentType });
      contactShapes.push(contactAvatarShape(contact, shapeId++, x, y, contactRelId).replace("<a:srcRect/>", `<a:srcRect l="${crop.left}" t="${crop.top}" r="${crop.right}" b="${crop.bottom}"/>`));
    } else {
      contactShapes.push(contactAvatarShape(contact, shapeId, x, y));
      shapeId += 2;
    }
    const detailsX = x + 1120000;
    const detailsWidth = cardWidth - 1250000;
    contactShapes.push(contactTextShape(shapeId++, detailsX, y + 20000, detailsWidth, 280000, [{ text: contact.name, size: 1800, color: "003366", bold: true }]));
    contactShapes.push(contactTextShape(shapeId++, detailsX, y + 300000, detailsWidth, 580000, [
      { text: contact.title, size: 1250, color: "31577D" },
      { text: contact.phone, size: 1150, color: "31577D" },
      { text: contact.email, size: 1050, color: "31577D" },
    ]));
  }
  const root = `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${contactTextShape(9000, contentStartX, 460000, contentWidth, 700000, [{ text: "CONTACTS", size: 1000, color: "C9A84C", bold: true }, { text: "For more information and to schedule a viewing, contact us:", size: 1900, color: "003366", italic: true }])}${contactShapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const allRelations = `<Relationships xmlns="${REL_NS}"><Relationship Id="rId1" Type="${REL_NS}/slideLayout" Target="${escapeXmlAttribute(layoutTarget)}"/>${imageRelationships.join("")}</Relationships>`;
  output.file(slidePath, markProposalPage(root, "Mosaic Proposal CTA"));
  output.file(relsPath, allRelations);
  const slideRelId = `rId${nextRelId}`;
  const target = relativePackagePath("ppt", slidePath);
  output.file("ppt/_rels/presentation.xml.rels", presentationRelsXml.replace(/<\/Relationships>/i, `<Relationship Id="${slideRelId}" Type="${REL_NS}/slide" Target="${target}"/></Relationships>`));
  output.file("ppt/presentation.xml", presentationXml.replace(/<\/p:sldIdLst>/i, `<p:sldId id="${nextSlideId}" r:id="${slideRelId}"/></p:sldIdLst>`));
  let nextContentTypes = ensureContentType(contentTypesXml, slidePath, "application/vnd.openxmlformats-officedocument.presentationml.slide+xml");
  for (const item of imageContentTypes) nextContentTypes = ensureContentType(nextContentTypes, item.path, item.contentType);
  output.file("[Content_Types].xml", nextContentTypes);
}

export async function appendProposalContactsToPptx(buffer: Uint8Array, contacts: ProposalContact[]): Promise<Uint8Array> {
  if (!contacts.length) return buffer;
  const output = await JSZip.loadAsync(buffer);
  await appendContactSlide(output, contacts);
  return output.generateAsync({ type: "uint8array" });
}

function replacePlaceholder(xml: string, placeholder: string, value: string | undefined): string {
  return value ? xml.replaceAll(placeholder, escapeXml(value)) : xml;
}

function markProposalPage(xml: string, pageName: "Mosaic Proposal Cover" | "Mosaic Proposal CTA"): string {
  return xml.replace(/<p:cSld\b([^>]*)>/i, (_tag, attributes: string) => {
    const named = /\bname="[^"]*"/i.test(attributes)
      ? attributes.replace(/\bname="[^"]*"/i, `name="${pageName}"`)
      : `${attributes} name="${pageName}"`;
    return `<p:cSld${named}>`;
  });
}

function personalizeIndustrialProposalLocation(xml: string, originalLocation: string, location: string): string {
  let updated = xml;
  if (originalLocation && location && originalLocation !== location) {
    const escapedOriginal = escapeXml(originalLocation).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const textToken = new RegExp(`(<a:t(?:\\s[^>]*)?>)${escapedOriginal}(</a:t>)`, "i");
    updated = updated.replace(textToken, `$1${escapeXml(location)}$2`);
  }

  const navyBackground = '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="021A3D"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>';
  if (/<p:bg\b[\s\S]*?<\/p:bg>/i.test(updated)) {
    updated = updated.replace(/<p:bg\b[\s\S]*?<\/p:bg>/i, navyBackground);
  } else {
    updated = updated.replace(/<p:cSld\b[^>]*>/i, (tag) => `${tag}${navyBackground}`);
  }

  const selectedLocation = escapeXml(location || originalLocation || "");
  return updated.replace(/<a:r\b[\s\S]*?<\/a:r>/gi, (runXml) => {
    const text = runXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/i)?.[1] || "";
    const color = /industrial\s+facility\s+proposal/i.test(text)
      ? "FFFFFF"
      : selectedLocation && text.toLocaleLowerCase().includes(selectedLocation.toLocaleLowerCase())
        ? "C9A84C"
        : undefined;
    if (!color) return runXml;
    const fill = `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>`;
    if (/<a:rPr\b[^>]*\/>/i.test(runXml)) {
      return runXml.replace(/<a:rPr\b([^>]*)\/>/i, `<a:rPr$1>${fill}</a:rPr>`);
    }
    if (/<a:rPr\b[^>]*>/i.test(runXml)) {
      return runXml.replace(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/i, fill)
        .replace(/(<a:rPr\b[^>]*>)(?![\s\S]*?<a:solidFill)/i, `$1${fill}`);
    }
    return runXml.replace(/(<a:r\b[^>]*>)/i, `$1<a:rPr lang="en-US" dirty="0">${fill}</a:rPr>`);
  });
}

function personalizePropertyLocation(xml: string, originalLocation: string | undefined, location: string): string {
  if (!originalLocation || !location || originalLocation === location) return xml;
  return xml.replaceAll(escapeXml(originalLocation), escapeXml(location));
}

function clientLogoAsset(dataUrl: string | undefined): { extension: string; contentType: string; bytes: Buffer } | null {
  const match = dataUrl?.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) return null;
  const extension = match[1].toLowerCase() === "png" ? "png" : "jpg";
  return {
    extension,
    contentType: extension === "png" ? "image/png" : "image/jpeg",
    bytes: Buffer.from(match[2], "base64"),
  };
}

function needsGeneratedCover(manifest: CompilationManifest): boolean {
  return manifest.generatedCover ?? !manifest.slides.some(
    (slide) => slide.slideRole === "cover" && !isIndustrialFacilityProposalSlide(slide),
  );
}

function solidRectangleShape(id: number, x: number, y: number, width: number, height: number, color: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Proposal accent"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`;
}

async function prependGeneratedCoverSlide(output: JSZip, proposal: CompilationManifest["proposal"]): Promise<void> {
  const presentationXml = await output.file("ppt/presentation.xml")?.async("string");
  const presentationRelsXml = await output.file("ppt/_rels/presentation.xml.rels")?.async("string");
  const contentTypesXml = await output.file("[Content_Types].xml")?.async("string");
  if (!presentationXml || !presentationRelsXml || !contentTypesXml) {
    throw new Error("The PowerPoint package is missing presentation metadata required to add a cover page.");
  }
  const firstSlideRelId = presentationXml.match(/<p:sldId\b[^>]*\br:id="([^"]+)"[^>]*\/>/i)?.[1];
  const firstSlideTarget = firstSlideRelId && presentationRelsXml.match(new RegExp(`<Relationship\\b(?=[^>]*\\bId="${firstSlideRelId}")(?=[^>]*\\bType="[^"]*\\/slide")[^>]*\\bTarget="([^"]+)"[^>]*/?>`, "i"))?.[1];
  if (!firstSlideTarget) throw new Error("The PowerPoint package has no source slide layout for the generated cover.");
  const firstSlidePath = normalizePackagePath(`ppt/${firstSlideTarget}`);
  const firstSlideRels = await output.file(relationshipsPath(firstSlidePath))?.async("string");
  const layoutTarget = firstSlideRels?.match(/<Relationship\b(?=[^>]*\bType="[^"]*\/slideLayout")[^>]*\bTarget="([^"]+)"[^>]*\/?\s*>/i)?.[1];
  if (!layoutTarget) throw new Error("The first exported slide has no layout relationship for the generated cover.");

  const slideWidth = Number(presentationXml.match(/<p:presentation\b[^>]*>[\s\S]*?<p:sldSz\b[^>]*\bcx="(\d+)"/)?.[1] || 12192000);
  const slideHeight = Number(presentationXml.match(/<p:presentation\b[^>]*>[\s\S]*?<p:sldSz\b[^>]*\bcy="(\d+)"/)?.[1] || 6858000);
  const coverPath = "ppt/slides/mosaic-generated-cover.xml";
  const coverRelsPath = relationshipsPath(coverPath);
  const margin = 900000;
  const logo = clientLogoAsset(proposal.clientLogoDataUrl);
  const logoRelId = logo ? "rIdLogo" : undefined;
  const logoPath = logo ? `ppt/media/mosaic-client-logo.${logo.extension}` : undefined;
  const logoShape = logo && logoRelId
    ? `<p:pic><p:nvPicPr><p:cNvPr id="9" name="Client logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${logoRelId}"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="${slideWidth - 3400000}" y="${margin}"/><a:ext cx="2500000" cy="1250000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
    : "";
  const coverShapes = [
    solidRectangleShape(2, 620000, 1050000, 55000, Math.min(4600000, slideHeight - 1750000), "C9A84C"),
    contactTextShape(3, margin, 950000, slideWidth - 2 * margin, 350000, [{ text: "PRIME PHILIPPINES  |  INDUSTRIAL & LOGISTICS ADVISORY", size: 1050, color: "C9A84C", bold: true }]),
    contactTextShape(4, margin, 1850000, slideWidth - 2 * margin - (logo ? 2850000 : 0), 1050000, [{ text: proposal.projectTitle || "Industrial Facility Proposal", size: 3600, color: "FFFFFF", bold: true }], "Georgia"),
    contactTextShape(5, margin, 3350000, slideWidth - 2 * margin, 300000, [{ text: "PREPARED EXCLUSIVELY FOR", size: 1000, color: "C9A84C", bold: true }]),
    contactTextShape(6, margin, 3700000, slideWidth - 2 * margin, 900000, [
      { text: proposal.clientName || "Valued Client", size: 2500, color: "FFFFFF", bold: true },
      { text: [proposal.clientDesignation, proposal.clientCompany].filter(Boolean).join(" · "), size: 1450, color: "D7E0EB" },
    ]),
    contactTextShape(7, margin, Math.max(4900000, slideHeight - 1500000), slideWidth - 2 * margin, 1000000, [
      { text: `PREPARED BY  ${proposal.preparedByName || "PRIME Philippines"}`, size: 1450, color: "FFFFFF", bold: true },
      { text: [proposal.preparedByDesignation, proposal.preparedByCompany, proposal.date].filter(Boolean).join("  ·  "), size: 1150, color: "D7E0EB" },
    ]),
    logoShape,
  ].join("");
  const coverXml = `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="Mosaic Proposal Cover"><p:bg><p:bgPr><a:solidFill><a:srgbClr val="021A3D"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${coverShapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const relationships = [`<Relationship Id="rId1" Type="${REL_NS}/slideLayout" Target="${escapeXmlAttribute(layoutTarget)}"/>`];
  if (logo && logoRelId && logoPath) {
    output.file(logoPath, logo.bytes);
    relationships.push(`<Relationship Id="${logoRelId}" Type="${REL_NS}/image" Target="../media/${pathFileName(logoPath)}"/>`);
  }
  output.file(coverPath, coverXml);
  output.file(coverRelsPath, `<Relationships xmlns="${REL_NS}">${relationships.join("")}</Relationships>`);

  const slideIds = [...presentationXml.matchAll(/<p:sldId\b[^>]*\bid="(\d+)"[^>]*\br:id="([^"]+)"[^>]*\/>/gi)];
  const slideRelId = `rId${nextRelationshipId(presentationRelsXml)}`;
  const slideId = Math.max(255, ...slideIds.map((match) => Number(match[1]))) + 1;
  const target = relativePackagePath("ppt", coverPath);
  output.file("ppt/_rels/presentation.xml.rels", presentationRelsXml.replace(/<\/Relationships>/i, `<Relationship Id="${slideRelId}" Type="${REL_NS}/slide" Target="${target}"/></Relationships>`));
  output.file("ppt/presentation.xml", presentationXml.replace(/<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/i, (_list, contents: string) => `<p:sldIdLst><p:sldId id="${slideId}" r:id="${slideRelId}"/>${contents}</p:sldIdLst>`));
  let updatedTypes = ensureContentType(contentTypesXml, coverPath, "application/vnd.openxmlformats-officedocument.presentationml.slide+xml");
  if (logo && logoPath) updatedTypes = ensureContentType(updatedTypes, logoPath, logo.contentType);
  output.file("[Content_Types].xml", updatedTypes);
}

function pathFileName(value: string): string {
  return value.slice(value.lastIndexOf("/") + 1);
}

async function personalizeCoverSlide(
  output: JSZip,
  destinationSlidePath: string,
  slideXml: string,
  proposal: CompilationManifest["proposal"],
  slideIndex: number,
): Promise<string> {
  const logo = clientLogoAsset(proposal.clientLogoDataUrl);
  let personalizedXml = slideXml
    .replaceAll("[ Broker Name(s) / Lead Advisor ]", escapeXml(proposal.preparedByName || ""))
    .replaceAll("[ Client Representative / Contact Name ]", escapeXml(proposal.clientName || ""))
    .replaceAll("[ Designation / Department ]", escapeXml(proposal.clientDesignation || ""))
    .replaceAll("[ Company / Organization Name ]", escapeXml(proposal.clientCompany || ""))
    .replaceAll("Retail &amp; Industrial Markets Division", escapeXml(proposal.preparedByDesignation || "Retail & Industrial Markets Division"));

  if (proposal.preparedByName && proposal.preparedByCompany) {
    personalizedXml = personalizedXml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/gi, (shapeXml) =>
      shapeXml.includes(escapeXml(proposal.preparedByName!))
        ? shapeXml.replaceAll("PRIME Philippines", escapeXml(proposal.preparedByCompany!))
        : shapeXml,
    );
  }

  if (!logo) {
    return personalizedXml.replaceAll("[ INSERT CLIENT LOGO OR PROJECT TITLE ]", escapeXml(proposal.clientCompany || proposal.clientName || ""));
  }

  let logoShapeFound = false;
  const pictureRelId = "rIdClientLogo";
  personalizedXml = personalizedXml.replace(/<p:sp\b[\s\S]*?<\/p:sp>/gi, (shapeXml) => {
    if (!/INSERT CLIENT LOGO OR PROJECT TITLE/i.test(shapeXml)) return shapeXml;
    const transform = shapeXml.match(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/i)?.[0];
    if (!transform) return shapeXml;
    const shapeId = shapeXml.match(/<p:cNvPr\b[^>]*\bid="(\d+)"/i)?.[1] || String(9000 + slideIndex);
    logoShapeFound = true;
    return `<p:pic><p:nvPicPr><p:cNvPr id="${shapeId}" name="Client logo"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${pictureRelId}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${transform}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
  });

  if (!logoShapeFound) {
    return personalizedXml.replaceAll("[ INSERT CLIENT LOGO OR PROJECT TITLE ]", escapeXml(proposal.clientCompany || proposal.clientName || ""));
  }

  const slideDirectory = packageDirectory(destinationSlidePath);
  const assetPath = `${slideDirectory}/assets/client-logo.${logo.extension}`;
  output.file(assetPath, logo.bytes);
  const relsPath = relationshipsPath(destinationSlidePath);
  const relsXml = await output.file(relsPath)?.async("string") || `<Relationships xmlns="${REL_NS}"></Relationships>`;
  const imageRelationshipType = `${REL_NS}/image`;
  const relId = `rId${nextRelationshipId(relsXml)}`;
  const target = relativePackagePath(slideDirectory, assetPath);
  output.file(relsPath, relsXml.replace(/<\/Relationships>/i, `<Relationship Id="${relId}" Type="${imageRelationshipType}" Target="${target}"/></Relationships>`));
  personalizedXml = personalizedXml.replaceAll(pictureRelId, relId);

  const contentTypes = await output.file("[Content_Types].xml")?.async("string") || "";
  output.file("[Content_Types].xml", ensureContentType(contentTypes, assetPath, logo.contentType));
  return personalizedXml;
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
  sourceFiles: ReadonlyMap<string, PptxSourceFile>,
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
    if (slide.slideRole === "cover" && !isIndustrialFacilityProposalSlide(slide)) {
      const slideXml = await output.file(destinationSlidePath)?.async("string");
      if (slideXml) {
        const personalized = await personalizeCoverSlide(output, destinationSlidePath, slideXml, manifest.proposal, index + 1);
        output.file(destinationSlidePath, markProposalPage(personalized, "Mosaic Proposal Cover"));
      }
    } else if (isIndustrialFacilityProposalSlide(slide) && slide.proposalLocation) {
      const slideXml = await output.file(destinationSlidePath)?.async("string");
      if (slideXml) {
        const originalLocation = slide.sourceLocation || slide.specs.location;
        output.file(destinationSlidePath, personalizeIndustrialProposalLocation(slideXml, originalLocation, slide.proposalLocation));
      }
    } else if (slide.slideRole === "property" && slide.sourceLocation) {
      const slideXml = await output.file(destinationSlidePath)?.async("string");
      if (slideXml) output.file(destinationSlidePath, personalizePropertyLocation(slideXml, slide.sourceLocation, cityNameFromLocation(slide.specs.location)));
    }
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

  const generatedCover = needsGeneratedCover(manifest);
  if (generatedCover) await prependGeneratedCoverSlide(output, manifest.proposal);
  await appendContactSlide(output, manifest.proposal.ctaContacts || []);

  const safeClient = (manifest.proposal.clientName || "Client")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const datePart = (manifest.proposal.date || new Date().toISOString().slice(0, 10)).replace(/[^0-9-]/g, "");
  const fileName = `PRIME_Proposal_${safeClient}_${datePart}.pptx`;
  const buffer = await output.generateAsync({ type: "uint8array" });
  await verifyProposalExport(buffer, manifest);
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
    slideCount: manifest.slides.length + Number(generatedCover) + 1,
  };
}

export async function verifyProposalExport(buffer: Uint8Array, manifest: CompilationManifest): Promise<void> {
  const output = await JSZip.loadAsync(buffer);
  const slidePaths = await getOrderedSlidePathsFromZip(output);
  const generatedCover = needsGeneratedCover(manifest);
  const expectedSlideCount = manifest.slides.length + Number(generatedCover) + 1;
  if (slidePaths.length !== expectedSlideCount) {
    throw new Error(`Export verification failed: expected ${expectedSlideCount} slides, found ${slidePaths.length}.`);
  }
  if (manifest.slides.some((slide) => slide.slideRole === "closing")) {
    throw new Error("Export verification failed: source CTA slides must be removed before compilation.");
  }

  const slideXmls = await Promise.all(slidePaths.map(async (slidePath) => {
    const xml = await output.file(slidePath)?.async("string");
    if (!xml) throw new Error(`Export verification failed: ${slidePath} is missing.`);
    return xml;
  }));
  const coverIndexes = slideXmls.flatMap((xml, index) => /<p:cSld\b[^>]*\bname="Mosaic Proposal Cover"/i.test(xml) ? [index] : []);
  const ctaIndexes = slideXmls.flatMap((xml, index) => /<p:cSld\b[^>]*\bname="Mosaic Proposal CTA"/i.test(xml) ? [index] : []);
  if (coverIndexes.length !== 1 || coverIndexes[0] !== 0) {
    throw new Error(`Export verification failed: expected one cover page at the beginning, found ${coverIndexes.length}.`);
  }
  if (ctaIndexes.length !== 1 || ctaIndexes[0] !== slidePaths.length - 1) {
    throw new Error(`Export verification failed: expected one generated CTA page at the end, found ${ctaIndexes.length}.`);
  }
  const ctaText = extractTextFromSlideXml(slideXmls.at(-1) || "");
  if (!ctaText.includes("For more information and to schedule a viewing")) {
    throw new Error("Export verification failed: the CTA page is missing its viewing prompt.");
  }
  const contentOffset = Number(generatedCover);
  for (const [index, slide] of manifest.slides.entries()) {
    if (!isIndustrialFacilityProposalSlide(slide)) continue;
    const dividerXml = slideXmls[contentOffset + index];
    if (!dividerXml?.includes('<a:srgbClr val="021A3D"/>')) {
      throw new Error(`Export verification failed: the ${slide.proposalLocation || slide.specs.location} divider is not navy blue.`);
    }
  }
}

export async function compileCopiedPptx(
  manifest: CompilationManifest,
  sourceFiles: ReadonlyMap<string, PptxSourceFile>,
) {
  return makeCopiedSlideDeck(manifest, sourceFiles);
}
