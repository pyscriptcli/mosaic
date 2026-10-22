import { randomUUID } from "node:crypto";
import { execFile as nodeExecFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { CompilationManifest } from "./property-decks";

const execFile = promisify(nodeExecFile);

const ASSEMBLE_SCRIPT = [
  "param([string]$ManifestPath, [string]$StagingPath)",
  "$ErrorActionPreference = 'Stop'",
  "$items = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json",
  "function Invoke-ComWithRetry([scriptblock]$Operation) {",
  "  for ($attempt = 0; $attempt -lt 40; $attempt++) {",
  "    try { return & $Operation } catch {",
  "      if ($_.Exception.HResult -ne -2147418111) { throw }",
  "      Start-Sleep -Milliseconds 250",
  "    }",
  "  }",
  "  throw 'PowerPoint remained busy and did not accept the export operation.'",
  "}",
  "$powerPoint = $null",
  "$sourcePresentation = $null",
  "$presentation = $null",
  "$verification = $null",
  "try {",
  "  $powerPoint = New-Object -ComObject PowerPoint.Application",
  "  $powerPoint.DisplayAlerts = 1",
  "  $sourcePresentation = Invoke-ComWithRetry { $powerPoint.Presentations.Open($items[0].deckFilePath, $true, $false, $false) }",
  "  $slideWidth = $sourcePresentation.PageSetup.SlideWidth",
  "  $slideHeight = $sourcePresentation.PageSetup.SlideHeight",
  "  Invoke-ComWithRetry { $sourcePresentation.Close() }",
  "  $sourcePresentation = $null",
  "  $presentation = $powerPoint.Presentations.Add()",
  "  Invoke-ComWithRetry { $presentation.PageSetup.SlideWidth = $slideWidth }",
  "  Invoke-ComWithRetry { $presentation.PageSetup.SlideHeight = $slideHeight }",
  "  foreach ($item in $items) {",
  "    $slideCountBefore = $presentation.Slides.Count",
  "    Invoke-ComWithRetry { $null = $presentation.Slides.InsertFromFile($item.deckFilePath, $slideCountBefore, [int]$item.slideNumber, [int]$item.slideNumber) }",
  "    if ($presentation.Slides.Count -ne ($slideCountBefore + 1)) { throw 'PowerPoint did not import the selected source slide.' }",
  "  }",
  "  if ($presentation.Slides.Count -ne $items.Count) { throw 'PowerPoint imported an unexpected number of slides.' }",
  "  Invoke-ComWithRetry { $presentation.SaveAs($StagingPath, 24) }",
  "  Invoke-ComWithRetry { $presentation.Close() }",
  "  $presentation = $null",
  "  $verification = Invoke-ComWithRetry { $powerPoint.Presentations.Open($StagingPath, $true, $false, $false) }",
  "  if ($verification.Slides.Count -ne $items.Count) { throw 'The exported PowerPoint file failed slide-count verification.' }",
  "  if ($verification.PageSetup.SlideWidth -ne $slideWidth -or $verification.PageSetup.SlideHeight -ne $slideHeight) { throw 'The exported PowerPoint file did not preserve the source slide dimensions.' }",
  "} finally {",
  "  if ($verification -ne $null) { try { Invoke-ComWithRetry { $verification.Close() } } catch { } }",
  "  if ($presentation -ne $null) { try { Invoke-ComWithRetry { $presentation.Close() } } catch { } }",
  "  if ($sourcePresentation -ne $null) { try { Invoke-ComWithRetry { $sourcePresentation.Close() } } catch { } }",
  "  if ($powerPoint -ne $null) { try { Invoke-ComWithRetry { $powerPoint.Quit() } } catch { } }",
  "}",
].join("\r\n");

export async function assemblePropertyDeckWithPowerPoint(
  manifest: CompilationManifest,
  outputPath: string,
): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("PowerPoint slide assembly requires Mosaic Helper to run on Windows.");
  }
  if (!manifest.slides.length) throw new Error("Select at least one slide to export.");

  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mosaic-pptx-assemble-"));
  const manifestPath = path.join(temporaryDirectory, "selected-slides.json");
  const scriptPath = path.join(temporaryDirectory, "assemble-pptx.ps1");
  const stagingPath = path.join(
    path.dirname(outputPath),
    `.${path.basename(outputPath, ".pptx")}.${randomUUID()}.tmp.pptx`,
  );

  try {
    const selectedSlides = manifest.slides.map(({ deckFilePath, slideNumber }) => ({
      deckFilePath,
      slideNumber,
    }));
    await Promise.all([
      fs.writeFile(manifestPath, JSON.stringify(selectedSlides), "utf8"),
      fs.writeFile(scriptPath, ASSEMBLE_SCRIPT, "utf8"),
    ]);
    await execFile("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      manifestPath,
      stagingPath,
    ], { windowsHide: true, timeout: 180_000, maxBuffer: 1024 * 1024 });
    const file = await fs.stat(stagingPath);
    if (file.size === 0) throw new Error("PowerPoint created an empty proposal file.");
    await fs.rename(stagingPath, outputPath);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown PowerPoint assembly error.";
    throw new Error(`PowerPoint could not assemble the selected slides: ${detail}`);
  } finally {
    await Promise.all([
      fs.rm(stagingPath, { force: true }).catch(() => undefined),
      fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined),
    ]);
  }
}
