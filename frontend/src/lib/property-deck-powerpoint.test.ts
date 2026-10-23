import { execFile as nodeExecFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { POWERPOINT_ASSEMBLY_SCRIPT } from "./property-deck-powerpoint";

const execFile = promisify(nodeExecFile);

describe("PowerPoint proposal assembly script", () => {
  it("fits uploaded logos with PowerPoint's aspect-ratio support without System.Drawing", () => {
    expect(POWERPOINT_ASSEMBLY_SCRIPT).not.toContain("System.Drawing.Image");
    expect(POWERPOINT_ASSEMBLY_SCRIPT).toContain("function Add-PictureFit");
    expect(POWERPOINT_ASSEMBLY_SCRIPT).toContain("LockAspectRatio = -1");
    expect(POWERPOINT_ASSEMBLY_SCRIPT).toContain("Add-PictureFit $slide $proposal.clientLogoPath");
    expect(POWERPOINT_ASSEMBLY_SCRIPT).toContain("Add-PictureFit $slide $proposal.clientLogoPath $left $top $width $height");
  });

  it.skipIf(process.platform !== "win32")("parses as valid PowerShell", async () => {
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "mosaic-powershell-parse-"));
    const assemblyPath = path.join(temporaryDirectory, "assemble-pptx.ps1");
    const parserPath = path.join(temporaryDirectory, "parse-script.ps1");
    try {
      await fs.writeFile(assemblyPath, POWERPOINT_ASSEMBLY_SCRIPT, "utf8");
      await fs.writeFile(parserPath, [
        "$tokens = $null",
        "$parseErrors = $null",
        "[void][System.Management.Automation.Language.Parser]::ParseFile($args[0], [ref]$tokens, [ref]$parseErrors)",
        "if ($parseErrors.Count -gt 0) { foreach ($parseError in $parseErrors) { [Console]::Error.WriteLine($parseError.ToString()) }; exit 1 }",
      ].join("\r\n"), "utf8");
      await execFile("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", parserPath, assemblyPath]);
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
