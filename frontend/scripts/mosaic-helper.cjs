/* eslint-disable @typescript-eslint/no-require-imports */
const http = require("node:http");
const { execFile, spawn } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const { promisify } = require("node:util");
const fs = require("node:fs");
const os = require("node:os");
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
  verifyProposalPdfExport,
} = require("../src/lib/property-decks-server.ts");
const {
  getPropertyDeckPptxPath,
  readPropertyDeckExport,
  registerPropertyDeckExport,
  setPropertyDeckPdf,
} = require("../src/lib/property-deck-downloads.ts");

const EXPORT_JOB_TTL_MS = 30 * 60 * 1000;
const exportJobs = new Map();

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function isAllowedRequest(request, response) {
  const origin = request.headers.origin;
  const requestUrl = new URL(request.url || "/", `http://${HOST}:${PORT}`);
  if (!origin && request.method === "GET" && [
    "/api/property-decks/thumbnail",
    "/api/property-decks/export-preview",
  ].includes(requestUrl.pathname)) {
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

function publicExportJob(job) {
  return {
    jobId: job.id,
    status: job.status,
    progress: job.progress,
    previews: job.previews.map(({ slide, title }) => ({
      slide,
      title,
      url: `/api/property-decks/export-preview?id=${job.id}&slide=${slide}`,
    })),
    previewWarning: Boolean(job.previewWarning),
    checklist: job.checklist || [],
    result: job.result || null,
    error: job.error || null,
  };
}

async function removeExpiredExportJobs(jobs = exportJobs) {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (job.expiresAt > now) continue;
    jobs.delete(id);
    if (job.previewDirectory) await fs.promises.rm(job.previewDirectory, { recursive: true, force: true }).catch(() => undefined);
  }
}

function scheduleExportJobCleanup(job, jobs) {
  const timer = setTimeout(async () => {
    if (jobs.get(job.id) !== job || job.expiresAt > Date.now()) return;
    jobs.delete(job.id);
    await fs.promises.rm(job.previewDirectory, { recursive: true, force: true }).catch(() => undefined);
  }, Math.max(1, job.expiresAt - Date.now()));
  timer.unref?.();
  job.expiryTimer = timer;
}

function createProposalExportInput(body, catalog) {
  const selectedSlideIds = Array.isArray(body.selectedSlideIds) ? body.selectedSlideIds.map(String) : [];
  if (!selectedSlideIds.length) throw new Error("Select at least one property slide to compile a proposal.");
  const proposalInput = body.proposal || {};
  const rawCtaContacts = Array.isArray(proposalInput.ctaContacts) ? proposalInput.ctaContacts.slice(0, 4) : [];
  const proposal = {
    clientName: String(proposalInput.clientName || "Valued Client").trim(),
    clientDesignation: String(proposalInput.clientDesignation || "").trim(),
    clientCompany: String(proposalInput.clientCompany || "").trim(),
    preparedByName: String(proposalInput.preparedByName || "").trim(),
    preparedByDesignation: String(proposalInput.preparedByDesignation || "").trim(),
    preparedByCompany: String(proposalInput.preparedByCompany || "").trim(),
    clientLogoDataUrl: typeof proposalInput.clientLogoDataUrl === "string" ? proposalInput.clientLogoDataUrl : "",
    ctaContacts: rawCtaContacts
      .filter((item) => item && typeof item === "object")
      .map((item, index) => ({
        id: String(item.id || `contact-${index + 1}`).slice(0, 80),
        name: String(item.name || "").trim().slice(0, 120),
        title: String(item.title || "").trim().slice(0, 160),
        phone: String(item.phone || "").trim().slice(0, 60),
        email: String(item.email || "").trim().slice(0, 160),
        photoDataUrl: typeof item.photoDataUrl === "string" && item.photoDataUrl.length <= 7 * 1024 * 1024
          ? item.photoDataUrl
          : undefined,
      }))
      .filter((contact) => contact.name),
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
  if (!manifest.slides.length) throw new Error("Selected slides could not be resolved in the current catalog. Rescan the folder and try again.");
  const outputFolder = String(body.outputFolder || "").trim() || catalog?.outputFolder || "";
  if (!outputFolder) throw new Error("Configure an output folder path before compiling.");
  return { manifest, outputFolder };
}

async function runProposalExportJob({ job, manifest, outputFolder, report }) {
  job.status = "assembling";
  const result = await compilePropertyDeck({
    manifest,
    outputFolder,
    previewDirectory: job.previewDirectory,
    onProgress: report,
  });
  job.checklist = [
    { id: "pptx", label: `PPTX opens and verified slide identities match all ${result.slideCount} proposal pages in order`, status: "passed" },
    { id: "cover", label: "One selected cover includes the client and prepared-by details", status: "passed" },
    { id: "properties", label: "Selected property pages and city-only locations match the proposal", status: "passed" },
    { id: "dividers", label: "One navy facility divider per city", status: "passed" },
    { id: "cta", label: `One final CTA includes ${manifest.proposal.ctaContacts?.length || 0} selected contact${manifest.proposal.ctaContacts?.length === 1 ? "" : "s"}`, status: "passed" },
  ];
  job.status = "validating";
  job.progress = { stage: "validating", currentSlide: result.slideCount, totalSlides: result.slideCount, title: "Checking exported files" };
  report(job.progress);
  const pdf = await convertPropertyDeckPdf(result.outputPath);
  const pdfBytes = new Uint8Array(await fs.promises.readFile(pdf.pdfPath));
  try {
    await verifyProposalPdfExport(pdfBytes, result.slideCount, manifest);
  } catch (error) {
    job.checklist.push({
      id: "pdf",
      label: "PDF opens, matches the proposal pages, and includes required content",
      status: "failed",
      detail: error instanceof Error ? error.message : "PDF validation failed.",
    });
    throw error;
  }
  const downloadId = registerPropertyDeckExport(result.outputPath, pdf.pdfPath);
  return {
    status: "ready",
    progress: { stage: "ready", currentSlide: result.slideCount, totalSlides: result.slideCount, title: "Export verified" },
    checklist: [
      ...job.checklist,
      { id: "pdf", label: "PDF opens, matches the proposal pages, and includes required content", status: "passed" },
    ],
    result: { ...result, pdfFileName: pdf.pdfFileName, downloadId },
  };
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
      sendJson(response, 200, { ok: true, helper: "Mosaic Helper", pid: process.pid });
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/property-decks/helper/restart") {
      sendJson(response, 202, { restarting: true, pid: process.pid });
      dependencies.restartHelper?.();
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
    if (request.method === "POST" && url.pathname === "/api/property-decks/export-jobs") {
      const body = await readJson(request);
      const catalog = await (dependencies.readCachedCatalog || readCachedCatalog)();
      const { manifest, outputFolder } = createProposalExportInput(body, catalog);
      await removeExpiredExportJobs(dependencies.exportJobs || exportJobs);
      const id = randomUUID();
      const previewDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mosaic-export-preview-"));
      const job = {
        id,
        status: "queued",
        progress: { stage: "queued", currentSlide: 0, totalSlides: manifest.slides.length + Number(Boolean(manifest.generatedCover)) + 1, title: "Preparing proposal" },
        previews: [],
        previewFiles: new Map(),
        previewDirectory,
        checklist: [],
        result: null,
        error: null,
        expiresAt: Date.now() + EXPORT_JOB_TTL_MS,
      };
      const jobs = dependencies.exportJobs || exportJobs;
      jobs.set(id, job);
      scheduleExportJobCleanup(job, jobs);
      job.status = "assembling";
      const report = (progress) => {
        const { previewPath, ...safeProgress } = progress;
        job.progress = safeProgress;
        if (previewPath && Number.isInteger(progress.currentSlide) && progress.currentSlide > 0) {
          const slide = progress.currentSlide;
          job.previewFiles.set(slide, previewPath);
          const currentPreview = job.previews.find((item) => item.slide === slide);
          const preview = { slide, title: String(progress.title || `Slide ${slide}`) };
          if (currentPreview) Object.assign(currentPreview, preview);
          else job.previews.push(preview);
        } else if (progress.stage === "assembling") {
          job.previewWarning = true;
        }
      };
      const runExport = dependencies.runExportJob || runProposalExportJob;
      Promise.resolve()
        .then(() => runExport({ job, manifest, outputFolder, report }))
        .then((result) => {
          Object.assign(job, result);
          job.expiresAt = Date.now() + EXPORT_JOB_TTL_MS;
          clearTimeout(job.expiryTimer);
          scheduleExportJobCleanup(job, jobs);
        })
        .catch((error) => {
          job.status = "failed";
          job.error = error instanceof Error ? error.message : "Proposal export failed.";
          if (!job.checklist.some((item) => item.status === "failed")) {
            const pdfFailure = /PDF validation failed|PDF conversion failed|PPTX was created, but PDF/i.test(job.error);
            job.checklist.push({
              id: pdfFailure ? "pdf" : "pptx",
              label: pdfFailure ? "PDF opens, matches the proposal pages, and includes required content" : "PPTX opens and verified slide identities match the selected pages and proposal details",
              status: "failed",
              detail: job.error,
            });
          }
          job.expiresAt = Date.now() + EXPORT_JOB_TTL_MS;
          clearTimeout(job.expiryTimer);
          scheduleExportJobCleanup(job, jobs);
        });
      sendJson(response, 202, { jobId: id });
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/property-decks/export-jobs") {
      const id = url.searchParams.get("id") || "";
      if (!/^[a-f0-9-]{36}$/i.test(id)) {
        sendJson(response, 400, { error: "Export job is invalid or expired." });
        return;
      }
      const jobs = dependencies.exportJobs || exportJobs;
      await removeExpiredExportJobs(jobs);
      const job = jobs.get(id);
      if (!job) {
        sendJson(response, 404, { error: "Export job is invalid or expired." });
        return;
      }
      sendJson(response, 200, publicExportJob(job));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/property-decks/export-preview") {
      const id = url.searchParams.get("id") || "";
      const slide = Number(url.searchParams.get("slide"));
      if (!/^[a-f0-9-]{36}$/i.test(id) || !Number.isSafeInteger(slide) || slide < 1) {
        sendJson(response, 400, { error: "Export preview is invalid or expired." });
        return;
      }
      const jobs = dependencies.exportJobs || exportJobs;
      await removeExpiredExportJobs(jobs);
      const filePath = jobs.get(id)?.previewFiles.get(slide);
      if (!filePath || !fs.existsSync(filePath)) {
        sendJson(response, 404, { error: "The slide preview is not available." });
        return;
      }
      const extension = path.extname(filePath).toLowerCase();
      if (extension !== ".png" && extension !== ".jpg" && extension !== ".jpeg") {
        sendJson(response, 415, { error: "The slide preview format is unsupported." });
        return;
      }
      response.writeHead(200, { "Content-Type": extension === ".png" ? "image/png" : "image/jpeg", "Cache-Control": "no-store" });
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
      const rawCtaContacts = Array.isArray(proposalInput.ctaContacts)
        ? proposalInput.ctaContacts.slice(0, 8)
        : [];
      const proposal = {
        clientName: String(proposalInput.clientName || "Valued Client").trim(),
        clientDesignation: String(proposalInput.clientDesignation || "").trim(),
        clientCompany: String(proposalInput.clientCompany || "").trim(),
        preparedByName: String(proposalInput.preparedByName || "").trim(),
        preparedByDesignation: String(proposalInput.preparedByDesignation || "").trim(),
        preparedByCompany: String(proposalInput.preparedByCompany || "").trim(),
        clientLogoDataUrl: typeof proposalInput.clientLogoDataUrl === "string" ? proposalInput.clientLogoDataUrl : "",
        ctaContacts: rawCtaContacts
          .filter((item) => item && typeof item === "object")
          .map((item, index) => ({
            id: String(item.id || `contact-${index + 1}`).slice(0, 80),
            name: String(item.name || "").trim().slice(0, 120),
            title: String(item.title || "").trim().slice(0, 160),
            phone: String(item.phone || "").trim().slice(0, 60),
            email: String(item.email || "").trim().slice(0, 160),
            photoDataUrl: typeof item.photoDataUrl === "string" && item.photoDataUrl.length <= 7 * 1024 * 1024
              ? item.photoDataUrl
              : undefined,
          }))
          .filter((contact) => contact.name),
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
      const result = await (dependencies.compilePropertyDeck || compilePropertyDeck)({ manifest, outputFolder });
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
  const server = http.createServer((request, response) => void handleRequest(request, response, {
    restartHelper: () => {
      setTimeout(() => {
        server.close(() => {
          const replacement = spawn(process.execPath, [__filename], {
            cwd: __dirname,
            detached: true,
            stdio: "ignore",
            windowsHide: true,
          });
          replacement.unref();
        });
      }, 100);
    },
  }));
  return server;
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
