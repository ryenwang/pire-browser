#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  PLATFORM_PACKAGES,
  binaryFileName,
  hostFileName,
  rootDir,
  tarballNameForPackage,
} from "./platform.mjs";

const root = rootDir();

export function verifyNpmArtifacts(distDir) {
  const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const version = rootPackage.version;
  const tarballs = findTarballs(resolve(distDir));
  const expectedNames = new Set([
    tarballName(rootPackage.name, version),
    ...Object.values(PLATFORM_PACKAGES).map((name) => tarballName(name, version)),
  ]);
  const actualNames = new Set(tarballs.map((path) => basename(path)));

  if (tarballs.length !== expectedNames.size) {
    throw new Error(`Expected ${expectedNames.size} npm tarballs, found ${tarballs.length}`);
  }
  for (const name of expectedNames) {
    if (!actualNames.has(name)) throw new Error(`Missing expected tarball: ${name}`);
  }
  for (const name of actualNames) {
    if (!expectedNames.has(name)) throw new Error(`Unexpected tarball: ${name}`);
  }

  verifyRootTarball(tarballFor(tarballs, rootPackage.name, version), rootPackage);
  for (const [tuple, packageName] of Object.entries(PLATFORM_PACKAGES)) {
    verifyPlatformTarball(tarballFor(tarballs, packageName, version), tuple, packageName, version, rootPackage);
  }
}

function verifyRootTarball(tarball, rootPackage) {
  const entries = tarEntries(tarball);
  const packageJson = tarJson(tarball, "package/package.json");
  if (packageJson.name !== rootPackage.name) throw new Error(`${basename(tarball)} has wrong package name`);
  if (packageJson.version !== rootPackage.version) throw new Error(`${basename(tarball)} has wrong version`);
  verifyRepositoryUrl(tarball, packageJson, rootPackage);
  rejectCommonLeakage(tarball, entries);
  const required = new Set([
    "package/bin/pire-browser.js",
    "package/pi/extensions/pire-browser.ts",
    "package/pi/extensions/pire-browser-runner.ts",
    "package/extension/manifest.json",
    "package/extension/dist/background.js",
    "package/agent/CONTEXT.md",
    "package/pire-browser.schema.json",
    "package/agent-browser.schema.json",
    "package/scripts/pi-install-migration.mjs",
    "package/scripts/pi-postinstall.mjs",
    "package/skills/pire-browser/SKILL.md",
    "package/skill-data/core/SKILL.md",
    "package/skill-data/dogfood/SKILL.md",
    "package/README.md",
    "package/LICENSE",
  ]);
  const actual = new Set(entries.filter((entry) => entry.type !== "directory").map((entry) => entry.name));
  for (const entry of required) {
    if (!actual.has(entry)) throw new Error(`${basename(tarball)} is missing required root entry ${entry}`);
  }
  for (const entry of entries) {
    if (/^package\/bin\/(win32|darwin|linux)-/.test(entry.name)) {
      throw new Error(`${basename(tarball)} leaked native binary directory: ${entry.name}`);
    }
    if (entry.name.endsWith("pire-browser.xpi") && entry.name !== "package/extension/pire-browser.xpi") {
      throw new Error(`${basename(tarball)} placed XPI outside package/extension: ${entry.name}`);
    }
  }
}

function verifyPlatformTarball(tarball, tuple, packageName, version, rootPackage) {
  const [platform] = tuple.split("-");
  const entries = tarEntries(tarball);
  const packageJson = tarJson(tarball, "package/package.json");
  if (packageJson.name !== packageName) throw new Error(`${basename(tarball)} has wrong package name`);
  if (packageJson.version !== version) throw new Error(`${basename(tarball)} has wrong version`);
  verifyRepositoryUrl(tarball, packageJson, rootPackage);
  rejectCommonLeakage(tarball, entries);

  const expected = new Set([
    "package/package.json",
    "package/README.md",
    "package/LICENSE",
    `package/bin/${binaryFileName(platform)}`,
    `package/bin/${hostFileName(platform)}`,
  ]);
  const actual = new Set(entries.filter((entry) => entry.type !== "directory").map((entry) => entry.name));
  for (const entry of actual) {
    if (!expected.has(entry)) throw new Error(`${basename(tarball)} has unexpected entry: ${entry}`);
  }
  for (const entry of expected) {
    if (!actual.has(entry)) throw new Error(`${basename(tarball)} is missing ${entry}`);
  }

  if (platform !== "win32") {
    for (const path of [`package/bin/${binaryFileName(platform)}`, `package/bin/${hostFileName(platform)}`]) {
      const entry = entries.find((candidate) => candidate.name === path);
      if (!entry?.mode.includes("x")) {
        throw new Error(`${basename(tarball)} entry ${path} is not executable in tarball mode ${entry?.mode ?? "(missing)"}`);
      }
    }
  }
}

export function normalizeRepositoryUrl(repository) {
  const url = typeof repository === "string" ? repository : repository?.url;
  if (!url) return "";
  return String(url)
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git\/?$/, "")
    .replace(/\/$/, "");
}

function verifyRepositoryUrl(tarball, packageJson, rootPackage) {
  const actual = normalizeRepositoryUrl(packageJson.repository);
  const expected = normalizeRepositoryUrl(rootPackage.repository);
  if (!actual || actual !== expected) {
    throw new Error(
      `${basename(tarball)} repository.url must match root package repository for npm provenance: ${expected}`
    );
  }
}

function rejectCommonLeakage(tarball, entries) {
  for (const { name } of entries) {
    if (name.includes("/node_modules/") || name.startsWith("package/node_modules/")) {
      throw new Error(`${basename(tarball)} leaked node_modules: ${name}`);
    }
    if (name.includes("/target/") || name.startsWith("package/target/")) {
      throw new Error(`${basename(tarball)} leaked target output: ${name}`);
    }
    if (name.startsWith("package/docs/")) {
      throw new Error(`${basename(tarball)} leaked docs: ${name}`);
    }
    if (name.startsWith(packageSubdir("fixtures")) || name.startsWith(packageSubdir("tests"))) {
      throw new Error(`${basename(tarball)} leaked fixtures: ${name}`);
    }
    if (/\.(test|spec)\.[cm]?[jt]s$/.test(name) || name.endsWith(".test.ts")) {
      throw new Error(`${basename(tarball)} leaked test file: ${name}`);
    }
  }
}

function packageSubdir(name) {
  return ["package", name, ""].join("/");
}

function tarballName(packageName, version) {
  return tarballNameForPackage(packageName, version);
}

function tarballFor(tarballs, packageName, version) {
  const name = tarballName(packageName, version);
  const path = tarballs.find((candidate) => basename(candidate) === name);
  if (!path) throw new Error(`Missing tarball ${name}`);
  return path;
}

function findTarballs(dir) {
  if (!existsSync(dir)) throw new Error(`Artifact directory does not exist: ${dir}`);
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findTarballs(path));
    if (entry.isFile() && entry.name.endsWith(".tgz")) out.push(path);
  }
  return out.sort();
}

function tarEntries(tarball) {
  const result = spawnSync("tar", ["-tvzf", tarball], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `tar failed for ${tarball}`);
  return result.stdout
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const match = /^(\S+)\s+.*?\s(package(?:\/.*)?)$/.exec(line);
      if (!match) throw new Error(`Could not parse tar entry from ${basename(tarball)}: ${line}`);
      return {
        mode: match[1],
        type: match[1][0] === "d" ? "directory" : "file",
        name: match[2],
      };
    });
}

function tarJson(tarball, path) {
  const result = spawnSync("tar", ["-xOzf", tarball, path], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `tar extract failed for ${path}`);
  return JSON.parse(result.stdout);
}

function main(argv) {
  const distDir = argv[0];
  if (!distDir) {
    console.error("Usage: node scripts/verify-npm-artifacts.mjs <dist-dir>");
    return 2;
  }
  try {
    verifyNpmArtifacts(distDir);
    console.log(`Verified npm artifacts in ${resolve(distDir)}`);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
