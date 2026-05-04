import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (process.env.PIRE_BROWSER_SKIP_POSTINSTALL === "1") {
  process.exit(0);
}

const windowsArch = (
  process.env.PROCESSOR_ARCHITEW6432 ||
  process.env.PROCESSOR_ARCHITECTURE ||
  process.arch
).toLowerCase();
const isWindowsX64 =
  process.platform === "win32" &&
  (process.arch === "x64" ||
    windowsArch.includes("amd64") ||
    windowsArch.includes("x64") ||
    process.env.PIRE_BROWSER_FORCE_WINDOWS_X64 === "1");

if (!isWindowsX64) {
  console.warn("pire-browser: packaged native setup currently supports Windows x64 only; skipping setup.");
  process.exit(0);
}

const exe = join(root, "bin", "win32-x64", "pire-browser.exe");
const host = join(root, "bin", "win32-x64", "pire-browser-host.exe");
const extensionManifest = join(root, "extension", "manifest.json");
const extensionBackground = join(root, "extension", "dist", "background.js");

for (const path of [exe, host, extensionManifest, extensionBackground]) {
  if (!existsSync(path)) {
    console.error(`pire-browser: missing packaged file: ${path}`);
    process.exit(1);
  }
}

const args = ["setup", "--windows"];
if (process.env.PIRE_BROWSER_FIREFOX_PATH) {
  args.push("--firefox-path", process.env.PIRE_BROWSER_FIREFOX_PATH);
}

const result = spawnSync(exe, args, { stdio: "inherit", windowsHide: true });
if (result.error) {
  console.error(`pire-browser: setup failed: ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0) {
  console.error("pire-browser: setup failed. Set PIRE_BROWSER_FIREFOX_PATH if Firefox is installed in a custom location.");
  process.exit(result.status ?? 1);
}

console.log("pire-browser: Pi package setup complete.");
