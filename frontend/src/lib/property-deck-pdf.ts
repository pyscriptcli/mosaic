import { execFile as nodeExecFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFile = promisify(nodeExecFile);

export async function convertPptxToPdf(pptxPath: string, pdfPath: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("PDF conversion requires Mosaic to run on Windows with Microsoft PowerPoint installed.");
  }

  const scriptPath = path.join(os.tmpdir(), `mosaic-pptx-to-pdf-${randomUUID()}.ps1`);
  const script = [
    "param([string]$InputPath, [string]$OutputPath)",
    "$ErrorActionPreference = 'Stop'",
    "$powerPoint = $null",
    "$presentation = $null",
    "try {",
    "  $powerPoint = New-Object -ComObject PowerPoint.Application",
    "  $presentation = $powerPoint.Presentations.Open($InputPath, $true, $false, $false)",
    "  $presentation.SaveAs($OutputPath, 32)",
    "} finally {",
    "  if ($presentation -ne $null) { $presentation.Close() }",
    "  if ($powerPoint -ne $null) { $powerPoint.Quit() }",
    "}",
  ].join("\r\n");

  await fs.writeFile(scriptPath, script, "utf8");
  try {
    await execFile("powershell.exe", [
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      pptxPath,
      pdfPath,
    ], { windowsHide: true, timeout: 180_000, maxBuffer: 1024 * 1024 });
    const pdf = await fs.readFile(pdfPath);
    if (!pdf.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("Microsoft PowerPoint did not produce a valid PDF file.");
    }
  } catch (error) {
    await fs.rm(pdfPath, { force: true }).catch(() => undefined);
    const detail = error instanceof Error ? error.message : "Unknown PowerPoint conversion error.";
    throw new Error(`PPTX was created, but PDF conversion failed: ${detail}`);
  } finally {
    await fs.rm(scriptPath, { force: true }).catch(() => undefined);
  }
}
