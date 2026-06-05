#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  PLATFORM_PACKAGES,
  binaryFileName,
  hostFileName,
  packageDirectoryName,
  rootDir,
} from "./platform.mjs";

const root = rootDir();

export function parsePackagePlatformArgs(argv) {
  const pack = argv.includes("--pack");
  const destinationIndex = argv.indexOf("--pack-destination");
  const packDestination =
    destinationIndex === -1 ? null : argv[destinationIndex + 1] ? resolve(argv[destinationIndex + 1]) : null;
  const requested = argv.includes("--all")
    ? Object.keys(PLATFORM_PACKAGES)
    : argv.filter((arg) => PLATFORM_PACKAGES[arg]);
  return { requested, pack, packDestination };
}

export function stagePlatformPackage(tuple, options = {}) {
  const packageName = PLATFORM_PACKAGES[tuple];
  const [platform] = tuple.split("-");
  const sourceDir = join(root, "bin", tuple);
  const packageTemplate = join(root, "platform-packages", packageDirectoryName(packageName), "package.json");
  const outDir = join(root, "target", "npm-platform-packages", packageName);
  const binary = binaryFileName(platform);
  const host = hostFileName(platform);
  const required = [join(sourceDir, binary), join(sourceDir, host), packageTemplate];

  for (const path of required) {
    if (!existsSync(path)) {
      console.error(`Missing ${path}. Build/copy ${tuple} binaries before staging ${packageName}.`);
      process.exit(1);
    }
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "bin"), { recursive: true });
  copyFileSync(packageTemplate, join(outDir, "package.json"));
  copyFileSync(join(root, "README.md"), join(outDir, "README.md"));
  copyFileSync(join(root, "LICENSE"), join(outDir, "LICENSE"));
  copyFileSync(join(sourceDir, binary), join(outDir, "bin", basename(binary)));
  copyFileSync(join(sourceDir, host), join(outDir, "bin", basename(host)));
  if (platform !== "win32") {
    chmodSync(join(outDir, "bin", basename(binary)), 0o755);
    chmodSync(join(outDir, "bin", basename(host)), 0o755);
  }

  const packArgs = ["pack", "--json"];
  if (!options.pack) packArgs.splice(1, 0, "--dry-run");
  if (options.pack && options.packDestination) {
    mkdirSync(options.packDestination, { recursive: true });
    packArgs.push("--pack-destination", options.packDestination);
  }
  const pack = spawnSync("npm", packArgs, {
    cwd: outDir,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (pack.status !== 0) {
    console.error(pack.stderr || pack.stdout);
    process.exit(pack.status ?? 1);
  }
  console.log(`${packageName}: staged at ${outDir}`);
  if (options.pack) {
    const [packed] = JSON.parse(pack.stdout);
    console.log(`${packageName}: packed ${packed.filename}`);
  }
  return outDir;
}

function main(argv) {
  const { requested, pack, packDestination } = parsePackagePlatformArgs(argv);

  if (requested.length === 0 || (pack && !packDestination)) {
    console.error(
      `Usage: node scripts/package-platform.mjs [--pack --pack-destination <dir>] (--all | ${Object.keys(PLATFORM_PACKAGES).join("|")})`
    );
    return 2;
  }

  for (const tuple of requested) {
    stagePlatformPackage(tuple, { pack, packDestination });
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
