import { existsSync, lstatSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const frontendDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dependencies = path.resolve(frontendDirectory, "../project-atlas/node_modules");
const installedDependencies = path.join(frontendDirectory, "node_modules");

if (!existsSync(installedDependencies)) {
  throw new Error("Mosaic dependencies are not installed; run npm install in frontend first.");
}

if (existsSync(dependencies)) {
  if (!lstatSync(dependencies).isSymbolicLink()) {
    throw new Error("project-atlas/node_modules exists and is not a dependency link; refusing to replace it.");
  }
} else {
  symlinkSync(installedDependencies, dependencies, process.platform === "win32" ? "junction" : "dir");
}
