const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const distDir = path.join(__dirname, "..", "dist");
const version = require("../package.json").version;
const installer = `Mosaic-Setup-${version}-x64.exe`;
if (!fs.existsSync(path.join(distDir, installer))) {
  console.error(`Mosaic installer ${installer} was not found in desktop/dist.`);
  process.exit(1);
}

const installerPath = path.join(distDir, installer);
const digest = crypto.createHash("sha256").update(fs.readFileSync(installerPath)).digest("hex");
fs.writeFileSync(path.join(distDir, "SHA256SUMS.txt"), `${digest}  ${installer}\n`, "utf8");
console.log(`Wrote SHA-256 checksum for ${installer}`);
