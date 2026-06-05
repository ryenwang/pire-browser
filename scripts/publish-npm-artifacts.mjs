#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  PLATFORM_PACKAGES,
  rootDir,
  tarballNameForPackage,
} from "./platform.mjs";
import { verifyNpmArtifacts } from "./verify-npm-artifacts.mjs";

const root = rootDir();

export function parsePublishNpmArtifactsArgs(argv) {
  const help = argv.includes("--help") || argv.includes("-h");
  const allowExisting = argv.includes("--allow-existing");
  const dryRun = argv.includes("--dry-run");
  const distDir = argv.find((arg) => !arg.startsWith("--"));
  return {
    help,
    allowExisting,
    dryRun,
    distDir: distDir ? resolve(distDir) : null,
  };
}

export function publishOrder(rootPackage) {
  return [
    ...Object.values(PLATFORM_PACKAGES).map((name) => ({ name, scoped: true })),
    { name: rootPackage.name, scoped: rootPackage.name.startsWith("@") },
  ];
}

export function publishCommand(tarball, { scoped, dryRun = false } = {}) {
  const args = ["publish", tarball];
  if (scoped) args.push("--access", "public");
  if (dryRun) args.push("--dry-run");
  return args;
}

export function packageExists(packageName, version, options = {}) {
  const result = spawnSync("npm", ["view", `${packageName}@${version}`, "version", "--json"], {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status === 0) return true;
  const text = `${result.stdout}\n${result.stderr}`;
  if (/E404|404 Not Found|not found/i.test(text)) return false;
  throw new Error(text.trim() || `npm view ${packageName}@${version} failed`);
}

export function findArtifactTarball(distDir, packageName, version) {
  const expected = tarballNameForPackage(packageName, version);
  const found = findTarballs(distDir).find((path) => basename(path) === expected);
  if (!found) throw new Error(`Missing publish artifact: ${expected}`);
  return found;
}

export function findTarballs(dir) {
  if (!existsSync(dir)) throw new Error(`Artifact directory does not exist: ${dir}`);
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTarballs(path));
    if (entry.isFile() && entry.name.endsWith(".tgz")) out.push(path);
  }
  return out.sort();
}

export function publishArtifacts(options) {
  const distDir = resolve(options.distDir);
  const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const version = rootPackage.version;
  verifyNpmArtifacts(distDir);

  for (const item of publishOrder(rootPackage)) {
    if (packageExists(item.name, version)) {
      if (!options.allowExisting) {
        throw new Error(`${item.name}@${version} already exists. Use --allow-existing only to resume a partial publish.`);
      }
      console.log(`${item.name}@${version}: already published; skipping`);
      continue;
    }
    const tarball = findArtifactTarball(distDir, item.name, version);
    const args = publishCommand(tarball, { scoped: item.scoped, dryRun: options.dryRun });
    const result = spawnSync("npm", args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (result.status !== 0) {
      throw new Error(`npm ${args.join(" ")} failed with ${result.status ?? 1}`);
    }
  }
}

function main(argv) {
  const options = parsePublishNpmArtifactsArgs(argv);
  if (options.help || !options.distDir) {
    console.error("Usage: node scripts/publish-npm-artifacts.mjs <dist-dir> [--allow-existing] [--dry-run]");
    return options.help ? 0 : 2;
  }
  try {
    publishArtifacts(options);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
