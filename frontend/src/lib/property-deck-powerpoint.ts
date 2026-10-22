import { randomUUID } from "node:crypto";
import { execFile as nodeExecFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { isIndustrialFacilityProposalSlide, type CompilationManifest } from "./property-decks";

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
  "function Set-CoverDetails($slide, $proposal) {",
  "  foreach ($shape in $slide.Shapes) {",
  "    if ($shape.HasTextFrame -eq 0 -or $shape.TextFrame.HasText -eq 0) { continue }",
  "    $text = [string]$shape.TextFrame.TextRange.Text",
  "    $logoToken = '[ INSERT CLIENT LOGO OR PROJECT TITLE ]'",
  "    if ($proposal.clientLogoPath -and $text.Contains($logoToken)) {",
  "      $left = [double]$shape.Left; $top = [double]$shape.Top; $width = [double]$shape.Width; $height = [double]$shape.Height",
  "      $shape.Delete()",
  "      $image = [System.Drawing.Image]::FromFile($proposal.clientLogoPath)",
  "      $aspect = $image.Width / [double]$image.Height; $image.Dispose()",
  "      if ($aspect -gt ($width / $height)) { $pictureWidth = $width; $pictureHeight = $width / $aspect } else { $pictureHeight = $height; $pictureWidth = $height * $aspect }",
  "      $picture = $slide.Shapes.AddPicture($proposal.clientLogoPath, $false, $true, $left + (($width - $pictureWidth) / 2), $top + (($height - $pictureHeight) / 2), $pictureWidth, $pictureHeight)",
  "      continue",
  "    }",
  "    $wasPreparedBy = $proposal.preparedByName -and ($text.Contains([string]$proposal.preparedByName) -or $text.Contains('[ Broker Name(s) / Lead Advisor ]'))",
  "    $text = $text.Replace('[ Broker Name(s) / Lead Advisor ]', [string]$proposal.preparedByName)",
  "    $text = $text.Replace('[ Client Representative / Contact Name ]', [string]$proposal.clientName)",
  "    $text = $text.Replace('[ Designation / Department ]', [string]$proposal.clientDesignation)",
  "    $text = $text.Replace('[ Company / Organization Name ]', [string]$proposal.clientCompany)",
  "    $text = $text.Replace('Retail & Industrial Markets Division', [string]$proposal.preparedByDesignation)",
  "    if ($wasPreparedBy -and $proposal.preparedByCompany) { $text = $text.Replace('PRIME Philippines', [string]$proposal.preparedByCompany) }",
  "    if ($proposal.clientCompany) { $text = $text.Replace($logoToken, [string]$proposal.clientCompany) }",
  "    $shape.TextFrame.TextRange.Text = $text",
  "  }",
  "}",
  "function Set-IndustrialProposalLocation($slide, $originalLocation, $proposalLocation) {",
  "  if (-not $originalLocation -or -not $proposalLocation -or $originalLocation -eq $proposalLocation) { return }",
  "  $proposalTitleSeen = $false",
  "  foreach ($shape in $slide.Shapes) {",
  "    if ($shape.HasTextFrame -eq 0 -or $shape.TextFrame.HasText -eq 0) { continue }",
  "    $text = [string]$shape.TextFrame.TextRange.Text",
  "    if ($text -match 'Industrial\\s+Facility\\s+Proposal') { $proposalTitleSeen = $true }",
  "    if ($proposalTitleSeen -and $text.Contains([string]$originalLocation)) {",
  "      $shape.TextFrame.TextRange.Text = $text.Replace([string]$originalLocation, [string]$proposalLocation)",
  "      return",
  "    }",
  "  }",
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
  "  foreach ($item in $items.slides) {",
  "    $slideCountBefore = $presentation.Slides.Count",
  "    Invoke-ComWithRetry { $null = $presentation.Slides.InsertFromFile($item.deckFilePath, $slideCountBefore, [int]$item.slideNumber, [int]$item.slideNumber) }",
  "    if ($presentation.Slides.Count -ne ($slideCountBefore + 1)) { throw 'PowerPoint did not import the selected source slide.' }",
  "    if ($item.slideRole -eq 'cover' -and -not $item.isIndustrialProposal) { Invoke-ComWithRetry { Set-CoverDetails $presentation.Slides.Item($slideCountBefore + 1) $items.proposal } }",
  "    if ($item.isIndustrialProposal -and $item.proposalLocation) { Invoke-ComWithRetry { Set-IndustrialProposalLocation $presentation.Slides.Item($slideCountBefore + 1) $item.originalLocation $item.proposalLocation } }",
  "  }",
  "  if ($presentation.Slides.Count -ne $items.slides.Count) { throw 'PowerPoint imported an unexpected number of slides.' }",
  "  Invoke-ComWithRetry { $presentation.SaveAs($StagingPath, 24) }",
  "  Invoke-ComWithRetry { $presentation.Close() }",
  "  $presentation = $null",
  "  $verification = Invoke-ComWithRetry { $powerPoint.Presentations.Open($StagingPath, $true, $false, $false) }",
  "  if ($verification.Slides.Count -ne $items.slides.Count) { throw 'The exported PowerPoint file failed slide-count verification.' }",
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
    let clientLogoPath = "";
    const logoMatch = manifest.proposal.clientLogoDataUrl?.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i);
    if (logoMatch) {
      const extension = logoMatch[1].toLowerCase() === "png" ? "png" : "jpg";
      clientLogoPath = path.join(temporaryDirectory, `client-logo.${extension}`);
      await fs.writeFile(clientLogoPath, Buffer.from(logoMatch[2], "base64"));
    }
    const selectedSlides = manifest.slides.map((slide) => ({
      deckFilePath: slide.deckFilePath,
      slideNumber: slide.slideNumber,
      slideRole: slide.slideRole,
      title: slide.title,
      isIndustrialProposal: isIndustrialFacilityProposalSlide(slide),
      originalLocation: slide.specs.location.split(",").map((part) => part.trim()).reverse().find((part) => /\bcity\b/i.test(part)) || slide.specs.location,
      proposalLocation: slide.proposalLocation,
    }));
    const proposalDetails = { ...manifest.proposal };
    delete proposalDetails.clientLogoDataUrl;
    const items = {
      slides: selectedSlides,
      proposal: { ...proposalDetails, clientLogoPath },
    };
    await Promise.all([
      fs.writeFile(manifestPath, JSON.stringify(items), "utf8"),
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
