#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  PLATFORM_PACKAGES,
  binaryFileName,
  hostFileName,
  platformTuple,
  rootDir,
} from "./platform.mjs";

export const RUST_TARGETS = Object.freeze({
  "win32-x64": "x86_64-pc-windows-msvc",
  "win32-ia32": "i686-pc-windows-msvc",
  "win32-arm64": "aarch64-pc-windows-msvc",
  "darwin-x64": "x86_64-apple-darwin",
  "darwin-arm64": "aarch64-apple-darwin",
  "linux-x64": "x86_64-unknown-linux-gnu",
  "linux-arm64": "aarch64-unknown-linux-gnu",
});

const root = rootDir();
const cliManifest = join(root, "cli", "Cargo.toml");

export function rustTargetForTuple(tuple) {
  const target = RUST_TARGETS[tuple];
  if (!target) throw new Error(`Unsupported platform tuple: ${tuple}`);
  return target;
}

export function isNativeTuple(tuple, platform = process.platform, arch = process.arch) {
  try {
    return tuple === platformTuple(platform, arch);
  } catch {
    return false;
  }
}

export function buildPlatform(tuple, options = {}) {
  const target = rustTargetForTuple(tuple);
  const [platform] = tuple.split("-");
  const dryRun = options.dryRun === true;
  const validateNative = options.validateNative ?? isNativeTuple(tuple);
  const outDir = join(root, "bin", tuple);
  const releaseDir = join(root, "cli", "target", target, "release");
  const executableSuffix = platform === "win32" ? ".exe" : "";
  const builtCli = join(releaseDir, `pire-browser${executableSuffix}`);
  const builtHost = join(releaseDir, `pire-browser-host${executableSuffix}`);
  const cliOut = join(outDir, binaryFileName(platform));
  const hostOut = join(outDir, hostFileName(platform));

  if (dryRun) {
    return { tuple, target, outDir, cliOut, hostOut, validateNative };
  }

  run("rustup", ["target", "add", target]);
  run("cargo", [
    "build",
    "--manifest-path",
    cliManifest,
    "--release",
    "--target",
    target,
    "-p",
    "pire-browser-cli",
    "-p",
    "pire-browser-host",
  ]);

  mkdirSync(outDir, { recursive: true });
  copyFileSync(builtCli, cliOut);
  copyFileSync(builtHost, hostOut);
  if (platform !== "win32") {
    chmodSync(cliOut, 0o755);
    chmodSync(hostOut, 0o755);
  }

  assertNonEmpty(cliOut);
  assertNonEmpty(hostOut);

  if (validateNative) {
    const result = spawnSync(cliOut, ["skills", "list", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `${cliOut} skills list failed`);
    }
  }

  return { tuple, target, outDir, cliOut, hostOut, validateNative };
}

function assertNonEmpty(path) {
  if (!existsSync(path)) throw new Error(`Missing expected binary: ${path}`);
  if (statSync(path).size <= 0) throw new Error(`Expected non-empty binary: ${path}`);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with ${result.status ?? 1}`);
  }
}

function main(argv) {
  const dryRun = argv.includes("--dry-run");
  const validateNative = !argv.includes("--skip-native-validation");
  const tuple = argv.find((arg) => PLATFORM_PACKAGES[arg]);
  if (!tuple) {
    console.error(`Usage: node scripts/build-platform.mjs <${Object.keys(PLATFORM_PACKAGES).join("|")}> [--dry-run] [--skip-native-validation]`);
    return 2;
  }
  try {
    const result = buildPlatform(tuple, {
      dryRun,
      validateNative: validateNative && isNativeTuple(tuple),
    });
    console.log(`${tuple}: ${dryRun ? "would build" : "built"} ${result.target} -> ${result.outDir}`);
    if (!result.validateNative) console.log(`${tuple}: native execution validation skipped on this runner`);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
