const http = require("node:http");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const execFileAsync = promisify(execFile);

const APP_ORIGIN = process.env.MOSAIC_HELPER_ALLOWED_ORIGIN || "https://mosaic-workspace.online";
const HOST = "127.0.0.1";
const PORT = Number(process.env.MOSAIC_HELPER_PORT || 43127);
const FRONTEND_ROOT = path.resolve(__dirname, "..");
const SOURCE_ROOT = path.join(FRONTEND_ROOT, "src");

const originalResolve = Module._resolveFilename;
Module._resolveFilename = function resolveMosaicModule(request, parent, isMain, options) {
  const mapped = request.startsWith("@/") ? path.join(SOURCE_ROOT, request.slice(2)) : request;
  return originalResolve.call(this, mapped, parent, isMain, options);
};

require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const {
  buildCompilationManifest,
} = require("../src/lib/property-decks.ts");
const {
  compilePropertyDeck,
  convertPropertyDeckPdf,
  readCachedCatalog,
  resolveSlideThumbnailFile,
  scanPropertyDeckFolder,
} = require("../src/lib/property-decks-server.ts");
const {
  getPropertyDeckPptxPath,
  readPropertyDeckExport,
  registerPropertyDeckExport,
  setPropertyDeckPdf,
} = require("../src/lib/property-deck-downloads.ts");

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function isAllowedRequest(request, response) {
  const origin = request.headers.origin;
  const requestUrl = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  if (!origin && request.method === "GET" && requestUrl.pathname === "/api/property-decks/thumbnail") {
    try {
      if (new URL(request.headers.referer || "").origin === APP_ORIGIN) {
        response.setHeader("Cache-Control", "no-store");
        return true;
      }
    } catch {
      // A direct or cross-site request has no trusted referrer.
    }
  }
  if (origin !== APP_ORIGIN) {
    sendJson(response, 403, { error: "Only the Mosaic workspace can use this helper." });
    return false;
  }
  response.setHeader("Access-Control-Allow-Origin", APP_ORIGIN);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Cache-Control", "no-store");
  return true;
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error("Request body is too large.");
  }
  return raw ? JSON.parse(raw) : {};
}

function sendFile(response, file) {
  response.writeHead(200, {
    "Content-Type": file.fileName.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "Content-Disposition": `attachment; filename="${file.fileName.replace(/[\"\r\n]/g, "_")}"`,
    "Cache-Control": "no-store",
  });
  response.end(file.content);
}

async function handleRequest(request, response, dependencies = {}) {
  if (request.method === "OPTIONS") {
    if (!isAllowedRequest(request, response)) return;
    response.writeHead(204);
    response.end();
    return;
  }
  if (!isAllowedRequest(request, response)) return;

  const url = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  try {
    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true, helper: "Mosaic Helper" });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/property-decks") {
      sendJson(response, 200, { catalog: await readCachedCatalog() });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/property-decks") {
      const body = await readJson(request);
      const sourceFolder = String(body.sourceFolder || "").trim();
      if (!sourceFolder) {
        sendJson(response, 400, { error: "Choose a local source folder." });
        return;
      }
      const catalog = await scanPropertyDeckFolder(
        sourceFolder,
        String(body.outputFolder || "").trim() || undefined,
        typeof body.maxDecks === "number" ? body.maxDecks : 35,
      );
      sendJson(response, 200, { catalog });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/property-decks/open") {
      const body = await readJson(request);
      const targetPath = String(body.targetPath || "").trim();
      if (!targetPath || targetPath.length > 1024 || body.action !== "reveal-folder") {
        sendJson(response, 400, { error: "Choose a valid local folder to reveal." });
        return;
      }
      const resolvedPath = path.resolve(targetPath);
      if (!fs.existsSync(resolvedPath)) {
        sendJson(response, 404, { error: "The export path no longer exists on this computer." });
        return;
      }
      const stat = await fs.promises.stat(resolvedPath);
      const args = stat.isDirectory() ? [resolvedPath] : [`/select,${resolvedPath}`];
      const openInExplorer = dependencies.openInExplorer || ((targetArgs) =>
        execFileAsync("explorer.exe", targetArgs, { windowsHide: true, timeout: 10_000 }));
      await openInExplorer(args);
      sendJson(response, 200, { opened: true });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/property-decks/thumbnail") {
      const slideId = url.searchParams.get("id") || "";
      const filePath = await resolveSlideThumbnailFile(slideId);
      if (!filePath) {
        const catalog = await readCachedCatalog();
        const slide = catalog?.slides.find((item) => item.id === slideId);
        const safeTitle = String(slide?.title || "Property slide").replace(/[&<>\"']/g, " ").slice(0, 70);
        response.writeHead(200, { "Content-Type": "image/svg+xml; charset=utf-8" });
        response.end(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><rect width="640" height="360" fill="#f3f6fa"/><text x="32" y="180" fill="#003366" font-family="Arial" font-size="24">${safeTitle}</text></svg>`);
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      response.writeHead(200, {
        "Content-Type": extension === ".png" ? "image/png" : "image/jpeg",
        "Cache-Control": "no-store",
      });
      response.end(await fs.promises.readFile(filePath));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/property-decks/compile") {
      const body = await readJson(request);
      const selectedSlideIds = Array.isArray(body.selectedSlideIds) ? body.selectedSlideIds.map(String) : [];
      if (selectedSlideIds.length === 0) {
        sendJson(response, 400, { error: "Select at least one property slide to compile a proposal." });
        return;
      }
      const catalog = await readCachedCatalog();
      const proposalInput = body.proposal || {};
      const proposal = {
        clientName: String(proposalInput.clientName || "Valued Client").trim(),
        clientDesignation: String(proposalInput.clientDesignation || "").trim(),
        clientCompany: String(proposalInput.clientCompany || "").trim(),
        preparedByName: String(proposalInput.preparedByName || "").trim(),
        preparedByDesignation: String(proposalInput.preparedByDesignation || "").trim(),
        preparedByCompany: String(proposalInput.preparedByCompany || "").trim(),
        clientLogoDataUrl: typeof proposalInput.clientLogoDataUrl === "string" ? proposalInput.clientLogoDataUrl : "",
        projectTitle: String(proposalInput.projectTitle || "Industrial Warehouse Property Options").trim(),
        brokerName: String(proposalInput.brokerName || "PRIME Industrial Advisory").trim(),
        brokerEmail: String(proposalInput.brokerEmail || "industrial@primephilippines.com").trim(),
        brokerPhone: String(proposalInput.brokerPhone || "+63 2 8888 0000").trim(),
        date: String(proposalInput.date || new Date().toISOString().slice(0, 10)).trim(),
        mode: proposalInput.mode === "comprehensive" ? "comprehensive" : "standard",
      };
      const manifest = buildCompilationManifest({
        selectedSlideIds,
        catalogSlides: catalog?.slides || [],
        overrides: body.overrides && typeof body.overrides === "object" ? body.overrides : {},
        proposal,
      });
      if (!manifest.slides.length) {
        sendJson(response, 400, { error: "Selected slides could not be resolved in the current catalog. Rescan the folder and try again." });
        return;
      }
      const outputFolder = String(body.outputFolder || "").trim() || catalog?.outputFolder || "";
      if (!outputFolder) {
        sendJson(response, 400, { error: "Configure an output folder path before compiling." });
        return;
      }
      const result = await compilePropertyDeck({ manifest, outputFolder });
      const downloadId = registerPropertyDeckExport(result.outputPath, null);
      sendJson(response, 200, { ...result, pdfError: null, downloadId, manifest });
      return;
    }
    if (request.method === "PUT" && url.pathname === "/api/property-decks/compile") {
      const body = await readJson(request);
      const downloadId = String(body.downloadId || "");
      const pptxPath = getPropertyDeckPptxPath(downloadId);
      if (!pptxPath) {
        sendJson(response, 404, { error: "Export session is invalid or expired." });
        return;
      }
      const pdf = await convertPropertyDeckPdf(pptxPath);
      setPropertyDeckPdf(downloadId, pdf.pdfPath);
      sendJson(response, 200, pdf);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/property-decks/compile") {
      const id = url.searchParams.get("id") || "";
      const format = url.searchParams.get("format");
      if (!/^[a-f0-9-]{36}$/i.test(id) || (format !== "pptx" && format !== "pdf")) {
        sendJson(response, 400, { error: "Export download is invalid or expired." });
        return;
      }
      const file = await readPropertyDeckExport(id, format);
      if (!file) {
        sendJson(response, 404, { error: "This export file is unavailable or has expired." });
        return;
      }
      sendFile(response, file);
      return;
    }
    sendJson(response, 404, { error: "Mosaic Helper endpoint not found." });
  } catch (error) {
    sendJson(response, 500, { error: error instanceof Error ? error.message : "Mosaic Helper request failed." });
  }
}

function createMosaicHelperServer() {
  return http.createServer((request, response) => void handleRequest(request, response));
}

if (require.main === module) {
  const server = createMosaicHelperServer();
  server.listen(PORT, HOST, () => {
    console.log(`Mosaic Helper is running at http://${HOST}:${PORT}`);
    console.log(`Allowed Mosaic site: ${APP_ORIGIN}`);
    console.log("Keep this window open while using Property Decks.");
  });
  server.on("error", (error) => {
    console.error(`Mosaic Helper could not start: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { createMosaicHelperServer, handleRequest };
