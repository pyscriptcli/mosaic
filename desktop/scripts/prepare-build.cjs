const fs = require("node:fs");
const path = require("node:path");

// Keep the packaged launcher on Mosaic's current Vercel project domain. Set
// MOSAIC_APP_URL explicitly when producing a build for another environment.
const configuredUrl = process.env.MOSAIC_APP_URL || "https://mosaic-workspace.online";

let parsed;
try {
  parsed = new URL(configuredUrl);
} catch {
  console.error("MOSAIC_APP_URL must be a valid HTTPS origin, for example https://mosaic.example.com.");
  process.exit(1);
}

if (
  parsed.protocol !== "https:" ||
  parsed.username ||
  parsed.password ||
  parsed.pathname !== "/" ||
  parsed.search ||
  parsed.hash
) {
  console.error("MOSAIC_APP_URL must contain only an HTTPS origin, with no credentials, path, query, or fragment.");
  process.exit(1);
}

const buildDir = path.join(__dirname, "..", "build");
fs.mkdirSync(buildDir, { recursive: true });
fs.writeFileSync(
  path.join(buildDir, "app-origin.json"),
  `${JSON.stringify({ origin: parsed.origin }, null, 2)}\n`,
  "utf8",
);
console.log(`Prepared Mosaic desktop for ${parsed.origin}`);
