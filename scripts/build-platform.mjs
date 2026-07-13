#!/usr/bin/env node
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  PLATFORM_PACKAGES,
  binaryFileName,
  hostFileName,
  packageDirectoryName,
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

export function cargoWorkspaceVersion(manifestText) {
  const section = /\[workspace\.package\]([\s\S]*?)(?:\n\[|$)/.exec(manifestText)?.[1] ?? "";
  const version = /^version\s*=\s*"([^"]+)"\s*$/m.exec(section)?.[1];
  if (!version) throw new Error("cli/Cargo.toml is missing workspace.package.version");
  return version;
}

export function assertReleaseVersionsAligned(rootPath = root) {
  const rootPackage = JSON.parse(readFileSync(join(rootPath, "package.json"), "utf8"));
  const cargoVersion = cargoWorkspaceVersion(readFileSync(join(rootPath, "cli", "Cargo.toml"), "utf8"));
  const mismatches = [];
  if (cargoVersion !== rootPackage.version) {
    mismatches.push(`cli/Cargo.toml=${cargoVersion}`);
  }
  for (const packageName of Object.values(PLATFORM_PACKAGES)) {
    const packageJson = JSON.parse(
      readFileSync(join(rootPath, "platform-packages", packageDirectoryName(packageName), "package.json"), "utf8"),
    );
    if (packageJson.version !== rootPackage.version) {
      mismatches.push(`${packageName}=${packageJson.version}`);
    }
    if (rootPackage.optionalDependencies?.[packageName] !== rootPackage.version) {
      mismatches.push(`optionalDependencies.${packageName}=${rootPackage.optionalDependencies?.[packageName] ?? "missing"}`);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`Release versions must match root ${rootPackage.version}: ${mismatches.join(", ")}`);
  }
  return rootPackage.version;
}

export function buildPlatform(tuple, options = {}) {
  assertReleaseVersionsAligned();
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
    const list = spawnSync(cliOut, ["skills", "list", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    if (list.status !== 0) {
      throw new Error(list.stderr || list.stdout || `${cliOut} skills list failed`);
    }
    const get = spawnSync(cliOut, ["skills", "get", "core", "--json"], {
      cwd: root,
      encoding: "utf8",
    });
    if (get.status !== 0) {
      throw new Error(get.stderr || get.stdout || `${cliOut} skills get core failed`);
    }
    const parsed = JSON.parse(get.stdout);
    const content = parsed?.data?.skill?.content ?? "";
    if (parsed?.success !== true || parsed?.data?.skill?.name !== "core" || !content.includes("pire-browser skills get --all")) {
      throw new Error(`${cliOut} did not return the current core skill contract`);
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
