const fs = require("node:fs");
const path = require("node:path");

const packagePath = path.join(__dirname, "..", "package.json");
const packageLockPath = path.join(__dirname, "..", "package-lock.json");
const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const runNumber = Number(process.env.GITHUB_RUN_NUMBER);
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);

if (!match || !Number.isSafeInteger(runNumber) || runNumber < 1) {
  throw new Error("A stable desktop version and GitHub Actions run number are required.");
}

const [, major, minor, currentPatch] = match;
const version = `${major}.${minor}.${Math.max(Number(currentPatch) + 1, runNumber)}`;
packageJson.version = version;
fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const lock = JSON.parse(fs.readFileSync(packageLockPath, "utf8"));
lock.version = version;
lock.packages[""].version = version;
fs.writeFileSync(packageLockPath, `${JSON.stringify(lock, null, 2)}\n`);

console.log(`Building Mosaic Desktop ${version}`);
