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
  "function Set-PropertySlideLocation($slide, $originalLocation, $proposalLocation) {",
  "  if (-not $originalLocation -or -not $proposalLocation -or $originalLocation -eq $proposalLocation) { return }",
  "  foreach ($shape in $slide.Shapes) {",
  "    if ($shape.HasTextFrame -eq 0 -or $shape.TextFrame.HasText -eq 0) { continue }",
  "    $text = [string]$shape.TextFrame.TextRange.Text",
  "    if ($text.Contains([string]$originalLocation)) { $shape.TextFrame.TextRange.Text = $text.Replace([string]$originalLocation, [string]$proposalLocation); return }",
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
  "function Set-ContactSlide($presentation, $contacts) {",
  "  if (-not $contacts -or $contacts.Count -eq 0) { return }",
  "  $slide = $presentation.Slides.Add($presentation.Slides.Count + 1, 12)",
  "  $slide.FollowMasterBackground = $false",
  "  $slide.Background.Fill.Solid()",
  "  $slide.Background.Fill.ForeColor.RGB = 16777215",
  "  $slideWidth = [double]$presentation.PageSetup.SlideWidth",
  "  $slideHeight = [double]$presentation.PageSetup.SlideHeight",
  "  $heading = $slide.Shapes.AddTextbox(1, 54, 36, $slideWidth - 108, 24)",
  "  $heading.TextFrame.TextRange.Text = 'CONTACTS'",
  "  $heading.TextFrame.TextRange.Font.Name = 'Arial'",
  "  $heading.TextFrame.TextRange.Font.Size = 10",
  "  $heading.TextFrame.TextRange.Font.Bold = -1",
  "  $heading.TextFrame.TextRange.Font.Color.RGB = 6697728",
  "  $title = $slide.Shapes.AddTextbox(1, 54, 62, $slideWidth - 108, 52)",
  "  $title.TextFrame.TextRange.Text = 'For more information and to schedule a viewing, contact us:'",
  "  $title.TextFrame.TextRange.Font.Name = 'Georgia'",
  "  $title.TextFrame.TextRange.Font.Size = 21",
  "  $title.TextFrame.TextRange.Font.Color.RGB = 6697728",
  "  $columns = if ($contacts.Count -gt 1) { 2 } else { 1 }",
  "  $rows = [Math]::Ceiling($contacts.Count / [double]$columns)",
  "  $margin = 54; $gap = 28; $top = 142",
  "  $cardWidth = ($slideWidth - (2 * $margin) - (($columns - 1) * $gap)) / $columns",
  "  $rowHeight = [Math]::Min(142, ($slideHeight - $top - 32) / [Math]::Max(1, $rows))",
  "  $photoSize = [Math]::Min(72, $rowHeight - 16)",
  "  for ($i = 0; $i -lt $contacts.Count; $i++) {",
  "    $contact = $contacts[$i]",
  "    $row = [Math]::Floor($i / $columns); $column = $i % $columns",
  "    $x = $margin + ($column * ($cardWidth + $gap)); $y = $top + ($row * $rowHeight)",
  "    $avatar = $slide.Shapes.AddShape(9, $x, $y, $photoSize, $photoSize)",
  "    $avatar.Line.ForeColor.RGB = 6697728; $avatar.Line.Weight = 1.25",
  "    if ($contact.photoPath -and (Test-Path -LiteralPath $contact.photoPath)) {",
  "      $avatar.Fill.UserPicture($contact.photoPath)",
  "    } else {",
  "      $avatar.Fill.Solid(); $avatar.Fill.ForeColor.RGB = 6697728",
  "      $avatar.TextFrame.TextRange.Text = (($contact.name -split '\\s+' | Select-Object -First 2 | ForEach-Object { $_.Substring(0, 1) }) -join '').ToUpperInvariant()",
  "      $avatar.TextFrame.TextRange.Font.Name = 'Arial'; $avatar.TextFrame.TextRange.Font.Size = 16; $avatar.TextFrame.TextRange.Font.Bold = -1; $avatar.TextFrame.TextRange.Font.Color.RGB = 16777215",
  "      $avatar.TextFrame.TextRange.ParagraphFormat.Alignment = 2",
  "    }",
  "    $textX = $x + $photoSize + 16; $textWidth = $cardWidth - $photoSize - 16",
  "    $name = $slide.Shapes.AddTextbox(1, $textX, $y + 2, $textWidth, 24)",
  "    $name.TextFrame.TextRange.Text = [string]$contact.name; $name.TextFrame.TextRange.Font.Name = 'Arial'; $name.TextFrame.TextRange.Font.Size = 16; $name.TextFrame.TextRange.Font.Bold = -1; $name.TextFrame.TextRange.Font.Color.RGB = 6697728",
  "    $details = $slide.Shapes.AddTextbox(1, $textX, $y + 28, $textWidth, $photoSize - 26)",
  "    $details.TextFrame.TextRange.Text = (@([string]$contact.title, [string]$contact.phone, [string]$contact.email) -join \"`r\")",
  "    $details.TextFrame.TextRange.Font.Name = 'Arial'; $details.TextFrame.TextRange.Font.Size = 11; $details.TextFrame.TextRange.Font.Color.RGB = 8083249",
  "    $details.TextFrame.WordWrap = -1",
  "  }",
  "}",
  "$powerPoint = $null",
  "$sourcePresentation = $null",
  "$presentation = $null",
  "$verification = $null",
  "try {",
  "  $powerPoint = New-Object -ComObject PowerPoint.Application",
  "  $powerPoint.DisplayAlerts = 1",
  "  if (-not $items.slides -or -not $items.slides[0].deckFilePath) { throw 'The proposal manifest is missing its source deck path.' }",
  "  $sourcePresentation = Invoke-ComWithRetry { $powerPoint.Presentations.Open($items.slides[0].deckFilePath, $true, $false, $false) }",
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
  "    if ($item.slideRole -eq 'property' -and $item.proposalLocation) { Invoke-ComWithRetry { Set-PropertySlideLocation $presentation.Slides.Item($slideCountBefore + 1) $item.originalLocation $item.proposalLocation } }",
  "  }",
  "  Invoke-ComWithRetry { Set-ContactSlide $presentation $items.proposal.ctaContacts }",
  "  $expectedSlideCount = $items.slides.Count + [int]($items.proposal.ctaContacts.Count -gt 0)",
  "  if ($presentation.Slides.Count -ne $expectedSlideCount) { throw 'PowerPoint imported an unexpected number of slides.' }",
  "  Invoke-ComWithRetry { $presentation.SaveAs($StagingPath, 24) }",
  "  Invoke-ComWithRetry { $presentation.Close() }",
  "  $presentation = $null",
  "  $verification = Invoke-ComWithRetry { $powerPoint.Presentations.Open($StagingPath, $true, $false, $false) }",
  "  if ($verification.Slides.Count -ne $expectedSlideCount) { throw 'The exported PowerPoint file failed slide-count verification.' }",
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
      originalLocation: slide.sourceLocation || slide.specs.location,
      proposalLocation: slide.proposalLocation || (slide.slideRole === "property" ? slide.specs.location : undefined),
    }));
    const contacts = await Promise.all((manifest.proposal.ctaContacts || []).map(async (contact, index) => {
      const imageMatch = contact.photoDataUrl?.match(/^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/=]+)$/i);
      if (!imageMatch) return { ...contact, photoPath: "" };
      const extension = imageMatch[1].toLowerCase() === "png" ? "png" : "jpg";
      const photoPath = path.join(temporaryDirectory, `contact-${index + 1}.${extension}`);
      await fs.writeFile(photoPath, Buffer.from(imageMatch[2], "base64"));
      return { ...contact, photoDataUrl: undefined, photoPath };
    }));
    const proposalDetails = { ...manifest.proposal, ctaContacts: contacts };
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
