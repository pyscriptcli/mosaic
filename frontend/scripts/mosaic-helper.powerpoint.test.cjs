/* eslint-disable @typescript-eslint/no-require-imports */
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const JSZip = require("jszip");
process.env.VITEST = "true";
const { handleRequest } = require("./mosaic-helper.cjs");
const execFileAsync = promisify(execFile);

const enabled = process.platform === "win32" && process.env.MOSAIC_TEST_POWERPOINT === "1";

function makeRequest(method, url, body) {
  return Object.assign(Readable.from(body === undefined ? [] : [JSON.stringify(body)]), {
    method,
    url,
    headers: {
      origin: "https://mosaic-workspace.online",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
  });
}

function makeResponse() {
  return {
    headers: {},
    status: 0,
    body: Buffer.alloc(0),
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers = {}) {
      this.status = status;
      for (const [name, value] of Object.entries(headers)) this.headers[name.toLowerCase()] = value;
    },
    end(body = "") { this.body = body; },
  };
}

async function callHelper(method, url, body) {
  const response = makeResponse();
  await handleRequest(makeRequest(method, url, body), response);
  return response;
}

test("one export returns a PowerPoint-openable selected-slide deck and its PDF", { skip: !enabled }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "mosaic-powerpoint-export-"));
  const sourceFolder = path.join(directory, "source");
  const outputFolder = path.join(directory, "output");
  const sourcePath = path.join(sourceFolder, "selected-slide-test.pptx");
  await fs.mkdir(sourceFolder, { recursive: true });
  await fs.mkdir(outputFolder, { recursive: true });

  try {
    const createSourcePath = path.join(directory, "create-source.ps1");
    const createSource = [
      "param([string]$Path)",
      "$ErrorActionPreference = 'Stop'",
      "$powerPoint = New-Object -ComObject PowerPoint.Application",
      "$presentation = $null",
      "try {",
      "  $presentation = $powerPoint.Presentations.Add()",
      "  $presentation.PageSetup.SlideWidth = 1440",
      "  $presentation.PageSetup.SlideHeight = 810",
      "  foreach ($index in 1..3) {",
      "    $slide = $presentation.Slides.Add($presentation.Slides.Count + 1, 12)",
      "    $shape = $slide.Shapes.AddTextbox(1, 20, 20, 600, 100)",
      "    $shape.TextFrame.TextRange.Text = \"Selected source slide $index\"",
      "  }",
      "  $presentation.SaveAs($Path, 24)",
      "} finally {",
      "  if ($presentation -ne $null) { $presentation.Close() }",
      "  if ($powerPoint -ne $null) { $powerPoint.Quit() }",
      "}",
    ].join("\r\n");
    await fs.writeFile(createSourcePath, createSource, "utf8");
    await execFileAsync("powershell.exe", [
      "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", createSourcePath,
      sourcePath,
    ], { windowsHide: true, timeout: 60_000 });

    const scan = await callHelper("POST", "/api/property-decks", { sourceFolder, outputFolder });
    assert.equal(scan.status, 200);
    const catalog = JSON.parse(scan.body.toString()).catalog;
    assert.equal(catalog.slides.length, 3);

    const compile = await callHelper("POST", "/api/property-decks/compile", {
      selectedSlideIds: [catalog.slides[2].id, catalog.slides[0].id],
      outputFolder,
      proposal: {
        clientName: "Mosaic Integration",
        date: "2026-10-22",
        ctaContacts: [{
          id: "integration-contact",
          name: "Integration Contact",
          title: "Leasing Advisor",
          phone: "+63 900 123 4567",
          email: "integration@example.com",
        }],
      },
    });
    assert.equal(compile.status, 200, compile.body.toString());
    const exported = JSON.parse(compile.body.toString());
    assert.equal(exported.slideCount, 3);

    const pptxDownload = await callHelper(
      "GET",
      `/api/property-decks/compile?id=${exported.downloadId}&format=pptx`,
    );
    assert.equal(pptxDownload.status, 200);
    assert.match(pptxDownload.headers["content-type"], /presentationml\.presentation/);

    const pdf = await callHelper("PUT", "/api/property-decks/compile", {
      downloadId: exported.downloadId,
    });
    assert.equal(pdf.status, 200, pdf.body.toString());
    const pdfDownload = await callHelper(
      "GET",
      `/api/property-decks/compile?id=${exported.downloadId}&format=pdf`,
    );
    assert.equal(pdfDownload.status, 200);
    assert.equal(pdfDownload.headers["content-type"], "application/pdf");
    const pdfBytes = pdfDownload.body;
    assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdfDocument = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
    assert.equal(pdfDocument.numPages, 3);
    const firstPdfPage = await pdfDocument.getPage(1);
    const secondPdfPage = await pdfDocument.getPage(2);
    const firstPdfText = (await firstPdfPage.getTextContent()).items.map((item) => item.str).join(" ");
    const secondPdfText = (await secondPdfPage.getTextContent()).items.map((item) => item.str).join(" ");
    const thirdPdfText = (await pdfDocument.getPage(3).then((page) => page.getTextContent())).items
      .map((item) => item.str).join(" ");
    assert.match(firstPdfText, /Selected source slide 3/);
    assert.match(secondPdfText, /Selected source slide 1/);
    assert.match(thirdPdfText, /Integration Contact/);
    assert.match(thirdPdfText, /integration@example.com/);
    const deck = await JSZip.loadAsync(pptxDownload.body);
    const presentation = await deck.file("ppt/presentation.xml").async("string");
    assert.equal((presentation.match(/<p:sldId\b/g) || []).length, 3);
    const firstSlide = await deck.file("ppt/slides/slide1.xml").async("string");
    const secondSlide = await deck.file("ppt/slides/slide2.xml").async("string");
    const contactSlide = await deck.file("ppt/slides/slide3.xml").async("string");
    assert.match(firstSlide, /Selected source slide 3/);
    assert.match(secondSlide, /Selected source slide 1/);
    assert.match(contactSlide, /Integration Contact/);
    assert.match(contactSlide, /integration@example\.com/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
