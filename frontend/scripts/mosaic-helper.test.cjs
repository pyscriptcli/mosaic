/* eslint-disable @typescript-eslint/no-require-imports */
const { after, before, describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const JSZip = require("jszip");
process.env.VITEST = "true";
const { handleRequest } = require("./mosaic-helper.cjs");

const allowedOrigin = "https://mosaic-workspace.online";
let tempDir;
function request(method, url, headers = {}) {
  return Object.assign(Readable.from([]), { method, url, headers });
}

function jsonRequest(method, url, body) {
  return Object.assign(Readable.from([JSON.stringify(body)]), {
    method,
    url,
    headers: { origin: allowedOrigin, "content-type": "application/json" },
  });
}

function response() {
  return {
    headers: {},
    status: 0,
    body: "",
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    writeHead(status, headers = {}) {
      this.status = status;
      for (const [name, value] of Object.entries(headers)) this.headers[name.toLowerCase()] = value;
    },
    end(body = "") { this.body = body; },
  };
}

describe("Mosaic Helper local HTTP boundary", () => {
  before(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "mosaic-helper-test-"));
    const sourceDir = path.join(tempDir, "source");
    await fs.mkdir(sourceDir, { recursive: true });
    const zip = new JSZip();
    zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:t>TEST PROPERTY</a:t></a:p><a:p><a:t>Location: Test City</a:t></a:p></p:sld>`);
    zip.file("[Content_Types].xml", `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`);
    zip.file("_rels/.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
    zip.file("ppt/presentation.xml", `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`);
    zip.file("ppt/_rels/presentation.xml.rels", `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`);
    await fs.writeFile(path.join(sourceDir, "test-property.pptx"), await zip.generateAsync({ type: "nodebuffer" }));
  });

  after(async () => {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("answers a health check from the hosted Mosaic origin", async () => {
    const res = response();
    await handleRequest(request("GET", "/health", { origin: allowedOrigin }), res);
    assert.equal(res.status, 200);
    assert.equal(res.headers["access-control-allow-origin"], allowedOrigin);
    assert.deepEqual(JSON.parse(res.body), { ok: true, helper: "Mosaic Helper", pid: process.pid });
  });

  it("accepts a helper restart request from the hosted Mosaic origin", async () => {
    let restartRequested = false;
    const res = response();
    await handleRequest(jsonRequest("POST", "/api/property-decks/helper/restart", {}), res, {
      restartHelper: () => { restartRequested = true; },
    });
    assert.equal(res.status, 202);
    assert.deepEqual(JSON.parse(res.body), { restarting: true, pid: process.pid });
    assert.equal(restartRequested, true);
  });

  it("rejects helper restart requests from other website origins", async () => {
    let restartRequested = false;
    const req = Object.assign(Readable.from(["{}"]), {
      method: "POST",
      url: "/api/property-decks/helper/restart",
      headers: { origin: "https://attacker.example", "content-type": "application/json" },
    });
    const res = response();
    await handleRequest(req, res, { restartHelper: () => { restartRequested = true; } });
    assert.equal(res.status, 403);
    assert.equal(restartRequested, false);
  });

  it("rejects calls from other website origins", async () => {
    const res = response();
    await handleRequest(request("GET", "/api/property-decks", { origin: "https://attacker.example" }), res);
    assert.equal(res.status, 403);
    assert.deepEqual(JSON.parse(res.body), { error: "Only the Mosaic workspace can use this helper." });
  });

  it("handles the hosted page's JSON CORS preflight", async () => {
    const res = response();
    await handleRequest(request("OPTIONS", "/api/property-decks", {
      origin: allowedOrigin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type",
    }), res);
    assert.equal(res.status, 204);
    assert.equal(res.headers["access-control-allow-methods"], "GET, POST, PUT, OPTIONS");
  });

  it("serves image-tag thumbnail requests only when they come from Mosaic", async () => {
    const corsRequest = response();
    await handleRequest(request("GET", "/api/property-decks/thumbnail?id=unknown", {
      origin: allowedOrigin,
    }), corsRequest);
    assert.equal(corsRequest.status, 200);
    assert.equal(corsRequest.headers["access-control-allow-origin"], allowedOrigin);
    assert.match(corsRequest.headers["content-type"], /image\/svg\+xml/);

    const allowed = response();
    await handleRequest(request("GET", "/api/property-decks/thumbnail?id=unknown", {
      referer: `${allowedOrigin}/property-decks`,
    }), allowed);
    assert.equal(allowed.status, 200);
    assert.match(allowed.headers["content-type"], /image\/svg\+xml/);

    const rejected = response();
    await handleRequest(request("GET", "/api/property-decks/thumbnail?id=unknown", {
      referer: "https://attacker.example/",
    }), rejected);
    assert.equal(rejected.status, 403);
  });

  it("opens a compiled proposal in File Explorer and returns launch failures", async () => {
    const targetPath = path.join(tempDir, "proposal.pptx");
    await fs.writeFile(targetPath, "pptx");
    let receivedArgs;
    const res = response();
    await handleRequest(jsonRequest("POST", "/api/property-decks/open", {
      targetPath,
      action: "reveal-folder",
    }), res, {
      openInExplorer: async (args) => { receivedArgs = args; },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(receivedArgs, [`/select,${targetPath}`]);
    assert.equal(JSON.parse(res.body).opened, true);

    const failed = response();
    await handleRequest(jsonRequest("POST", "/api/property-decks/open", {
      targetPath,
      action: "reveal-folder",
    }), failed, {
      openInExplorer: async () => { throw new Error("Explorer launch failed."); },
    });
    assert.equal(failed.status, 500);
    assert.match(JSON.parse(failed.body).error, /Explorer launch failed/);
  });

  it("indexes a local folder and exports the selected slide as a downloadable PPTX", async () => {
    const sourceFolder = path.join(tempDir, "source");
    const outputFolder = path.join(tempDir, "output");
    const scanResponse = response();
    await handleRequest(jsonRequest("POST", "/api/property-decks", { sourceFolder, outputFolder }), scanResponse);
    assert.equal(scanResponse.status, 200);
    const catalog = JSON.parse(scanResponse.body).catalog;
    assert.equal(catalog.slides.length, 1);

    const compileResponse = response();
    await handleRequest(jsonRequest("POST", "/api/property-decks/compile", {
      selectedSlideIds: [catalog.slides[0].id],
      outputFolder,
      proposal: { clientName: "Test Client", date: "2026-10-22" },
    }), compileResponse);
    assert.equal(compileResponse.status, 200);
    const compiled = JSON.parse(compileResponse.body);
    assert.equal(compiled.slideCount, 1);
    const exported = await JSZip.loadAsync(await fs.readFile(compiled.outputPath));
    assert.match(await exported.file("ppt/slides/slide1.xml").async("string"), /TEST PROPERTY/);

    const downloadResponse = response();
    await handleRequest(request("GET", `/api/property-decks/compile?id=${compiled.downloadId}&format=pptx`, { origin: allowedOrigin }), downloadResponse);
    assert.equal(downloadResponse.status, 200);
    assert.match(downloadResponse.headers["content-type"], /presentationml.presentation/);
    assert.equal(downloadResponse.body.byteLength, (await fs.readFile(compiled.outputPath)).byteLength);
  });
});
