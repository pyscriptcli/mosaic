import mammoth from "mammoth";
import JSZip from "jszip";
import { assertWordArchiveWithinLimits, type DeltaEntry } from "./compare";

const safeTags = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "div", "span", "br", "hr", "strong", "b", "em", "i", "u", "s", "del", "ins", "sub", "sup", "blockquote", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "img"]);
const blockedTags = new Set(["script", "style", "iframe", "object", "embed", "form", "input", "video", "audio", "svg", "math"]);

function copySafeChildren(source: Node, destination: Node, document: Document) {
  source.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      destination.appendChild(document.createTextNode(child.textContent || ""));
      return;
    }
    if (!(child instanceof Element)) return;
    const tag = child.tagName.toLowerCase();
    if (blockedTags.has(tag)) return;
    if (!safeTags.has(tag)) {
      copySafeChildren(child, destination, document);
      return;
    }

    const safe = document.createElement(tag);
    if (tag === "img") {
      const src = child.getAttribute("src") || "";
      if (!/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z\d+/=]+$/i.test(src)) {
        const alt = child.getAttribute("alt");
        if (alt) destination.appendChild(document.createTextNode(`[${alt}]`));
        return;
      }
      safe.setAttribute("src", src);
      const alt = child.getAttribute("alt");
      if (alt) safe.setAttribute("alt", alt.slice(0, 300));
      ["width", "height"].forEach((attribute) => {
        const value = child.getAttribute(attribute);
        if (value && /^\d{1,4}$/.test(value)) safe.setAttribute(attribute, value);
      });
    } else {
      ["colspan", "rowspan"].forEach((attribute) => {
        const value = child.getAttribute(attribute);
        if (value && /^\d{1,2}$/.test(value)) safe.setAttribute(attribute, value);
      });
      const changeId = child.getAttribute("data-word-change");
      if (changeId && /^[\w-]{1,120}$/.test(changeId)) safe.setAttribute("data-word-change", changeId);
    }
    destination.appendChild(safe);
    if (tag !== "img" && tag !== "br" && tag !== "hr") copySafeChildren(child, safe, document);
  });
}

export function sanitizeWordHtml(html: string): string {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const clean = parsed.createElement("div");
  copySafeChildren(parsed.body, clean, parsed);
  return clean.innerHTML;
}

function normalizedHeading(value: string) {
  return value
    .replace(/^\s*(?:(?:section|article|clause|schedule|annex|appendix)\s+)?(?:\d+(?:\.\d+)*|[ivxlcdm]+)[.)\s]+/i, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

export function markWordSections(html: string, entries: DeltaEntry[], side: "original" | "revised") {
  const parsed = new DOMParser().parseFromString(sanitizeWordHtml(html), "text/html");
  const blocks = Array.from(parsed.body.querySelectorAll("p,h1,h2,h3,h4,h5,h6,td,th"));
  entries.forEach((entry) => {
    const section = side === "original" ? entry.originalSection : entry.revisedSection;
    const label = side === "original" ? entry.originalText : entry.revisedText;
    const expectedHeading = normalizedHeading(section);
    let match = expectedHeading ? blocks.find((block) => normalizedHeading(block.textContent || "") === expectedHeading) : undefined;
    if (!match && label) {
      const excerpt = normalizedHeading(label.split(/\s+/).slice(0, 8).join(" "));
      if (excerpt.length >= 18) match = blocks.find((block) => normalizedHeading(block.textContent || "").includes(excerpt));
    }
    if (match) match.setAttribute("data-word-change", entry.id);
  });
  return sanitizeWordHtml(parsed.body.innerHTML);
}

export async function readWordHtml(file: File): Promise<string> {
  try {
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} exceeds the 20 MiB file limit.`);
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    assertWordArchiveWithinLimits(zip.files);
    const result = await mammoth.convertToHtml({ arrayBuffer }, { convertImage: mammoth.images.dataUri });
    if (!result.value.trim()) throw new Error("No readable Word content was found.");
    return sanitizeWordHtml(result.value);
  } catch (cause) {
    if (cause instanceof Error && (cause.message.includes(file.name) || cause.message.includes("limit"))) throw cause;
    throw new Error(`${file.name} could not be rendered as a Word document. Check that it is a valid .docx file and try again.`);
  }
}
