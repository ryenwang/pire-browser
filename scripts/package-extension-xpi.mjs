#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { rootDir } from "./platform.mjs";

export const SIGN_TIMEOUT_MS = 300_000;

const root = rootDir();

export function parsePackageExtensionXpiArgs(argv) {
  const options = {
    sign: false,
    skipBuild: false,
    sourceDir: join(root, "extension"),
    outputPath: join(root, "extension", "pire-browser.xpi"),
    artifactsDir: join(root, "web-ext-artifacts"),
    timeoutMs: SIGN_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--sign") {
      options.sign = true;
    } else if (arg === "--skip-build") {
      options.skipBuild = true;
    } else if (arg === "--source-dir") {
      options.sourceDir = resolve(requiredValue(argv, ++i, arg));
      if (options.outputPath === join(root, "extension", "pire-browser.xpi")) {
        options.outputPath = join(options.sourceDir, "pire-browser.xpi");
      }
    } else if (arg === "--output") {
      options.outputPath = resolve(requiredValue(argv, ++i, arg));
    } else if (arg === "--artifacts-dir") {
      options.artifactsDir = resolve(requiredValue(argv, ++i, arg));
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number(requiredValue(argv, ++i, arg));
      if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
        throw new Error("--timeout-ms must be a positive number");
      }
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

export function createUnsignedXpi({ sourceDir, outputPath }) {
  const files = collectExtensionFiles(sourceDir);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, createZip(files));
  return {
    outputPath,
    files: files.map((file) => file.relativePath),
  };
}

export function webExtSignArgs({ sourceDir, artifactsDir, apiKey, apiSecret }) {
  return [
    "--yes",
    "web-ext",
    "sign",
    "--channel=unlisted",
    "--source-dir",
    sourceDir,
    "--artifacts-dir",
    artifactsDir,
    "--api-key",
    apiKey,
    "--api-secret",
    apiSecret,
  ];
}

export function signXpi({ sourceDir, outputPath, artifactsDir, timeoutMs = SIGN_TIMEOUT_MS, env = process.env }) {
  const apiKey = env.WEB_EXT_API_KEY;
  const apiSecret = env.WEB_EXT_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error("web-ext signing requires WEB_EXT_API_KEY and WEB_EXT_API_SECRET environment variables");
  }

  rmSync(artifactsDir, { recursive: true, force: true });
  mkdirSync(artifactsDir, { recursive: true });
  const result = spawnSync(npxCommand(), webExtSignArgs({ sourceDir, artifactsDir, apiKey, apiSecret }), {
    cwd: root,
    encoding: "utf8",
    env,
    shell: process.platform === "win32",
    timeout: timeoutMs,
  });

  if (result.error?.code === "ETIMEDOUT" || result.signal) {
    throw new Error(`web-ext sign timed out after ${timeoutMs}ms; AMO may be slow or unavailable`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "web-ext sign failed");
  }

  const signedXpi = newestXpi(artifactsDir);
  mkdirSync(dirname(outputPath), { recursive: true });
  copyFileSync(signedXpi, outputPath);
  return {
    outputPath,
    signedXpi,
  };
}

function buildExtension(sourceDir) {
  const result = spawnSync(npmCommand(), ["--prefix", sourceDir, "run", "build"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`extension build failed with status ${result.status}`);
  }
}

function collectExtensionFiles(sourceDir) {
  const manifest = join(sourceDir, "manifest.json");
  const dist = join(sourceDir, "dist");
  if (!existsSync(manifest)) throw new Error(`Missing extension manifest: ${manifest}`);
  if (!existsSync(dist)) throw new Error(`Missing extension dist directory: ${dist}`);

  return [
    { absolutePath: manifest, relativePath: "manifest.json" },
    ...collectFiles(dist).map((absolutePath) => ({
      absolutePath,
      relativePath: relative(sourceDir, absolutePath).split(sep).join("/"),
    })),
  ].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

function collectFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectFiles(path));
    if (entry.isFile()) out.push(path);
  }
  return out;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.relativePath, "utf8");
    const data = readFileSync(file.absolutePath);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(dosDate(), 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(dosDate(), 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

function dosDate() {
  return (1 << 5) | 1;
}

const CRC_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let i = 0; i < 8; i += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function newestXpi(artifactsDir) {
  const candidates = collectFiles(artifactsDir)
    .filter((path) => path.endsWith(".xpi"))
    .map((path) => ({ path, mtimeMs: statSync(path).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (candidates.length === 0) {
    throw new Error(`web-ext sign did not produce a signed .xpi in ${artifactsDir}`);
  }
  return candidates[0].path;
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function npxCommand() {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

function main(argv) {
  try {
    const options = parsePackageExtensionXpiArgs(argv);
    if (!options.skipBuild) buildExtension(options.sourceDir);
    const result = options.sign
      ? signXpi(options)
      : createUnsignedXpi(options);
    const kind = options.sign ? "Signed" : "Unsigned";
    console.log(`${kind} XPI: ${result.outputPath}`);
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
