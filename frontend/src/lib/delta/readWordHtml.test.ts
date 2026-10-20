// @vitest-environment jsdom
import mammoth from "mammoth";
import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readWordHtml } from "./wordDocument";

vi.mock("mammoth", () => ({
  default: {
    convertToHtml: vi.fn(),
    images: { dataUri: vi.fn() },
  },
}));

async function makeWordFile(name: string) {
  const zip = new JSZip();
  zip.file("word/document.xml", "<w:document />");
  const buffer = await zip.generateAsync({ type: "arraybuffer" });
  const file = new File(["docx bytes"], name);
  Object.defineProperty(file, "arrayBuffer", { value: async () => buffer });
  return file;
}

describe("readWordHtml", () => {
  beforeEach(() => vi.mocked(mammoth.convertToHtml).mockReset());

  it("renders DOCX bytes in the browser and sanitizes Mammoth output", async () => {
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({
      value: '<h1>Payment</h1><p>Payment terms</p><script>alert(1)</script>',
      messages: [],
    });
    const file = await makeWordFile("contract.docx");

    const html = await readWordHtml(file);

    expect(html).toContain("<h1>Payment</h1>");
    expect(html).toContain("<p>Payment terms</p>");
    expect(html).not.toContain("script");
    expect(mammoth.convertToHtml).toHaveBeenCalledWith(
      { arrayBuffer: expect.any(ArrayBuffer) },
      { convertImage: mammoth.images.dataUri },
    );
  });

  it("reports an unreadable DOCX when the conversion has no document content", async () => {
    vi.mocked(mammoth.convertToHtml).mockResolvedValue({ value: "  ", messages: [] });

    const file = await makeWordFile("broken.docx");
    await expect(readWordHtml(file)).rejects.toThrow(
      "broken.docx could not be rendered as a Word document.",
    );
  });
});
