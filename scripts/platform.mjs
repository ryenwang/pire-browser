import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PLATFORM_PACKAGES = Object.freeze({
  "win32-x64": "@ryenw/pire-browser-win32-x64",
  "win32-ia32": "@ryenw/pire-browser-win32-ia32",
  "win32-arm64": "@ryenw/pire-browser-win32-arm64",
  "darwin-x64": "@ryenw/pire-browser-darwin-x64",
  "darwin-arm64": "@ryenw/pire-browser-darwin-arm64",
  "linux-x64": "@ryenw/pire-browser-linux-x64",
  "linux-arm64": "@ryenw/pire-browser-linux-arm64",
});

export function rootDir() {
  return dirname(dirname(fileURLToPath(import.meta.url)));
}

export function rootPackageJson(root = rootDir()) {
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

export function platformTuple(platform = process.platform, arch = process.arch) {
  const normalizedArch = arch === "x64" || arch === "ia32" || arch === "arm64" ? arch : arch;
  const tuple = `${platform}-${normalizedArch}`;
  if (!Object.hasOwn(PLATFORM_PACKAGES, tuple)) {
    throw new Error(
      `Unsupported pire-browser platform: ${platform}/${arch}. Supported: ${Object.keys(PLATFORM_PACKAGES).join(", ")}`
    );
  }
  return tuple;
}

export function packageNameForTuple(tuple) {
  const packageName = PLATFORM_PACKAGES[tuple];
  if (!packageName) throw new Error(`Unsupported pire-browser platform tuple: ${tuple}`);
  return packageName;
}

export function packageDirectoryName(packageName) {
  return packageName.replace(/^@[^/]+\//, "");
}

export function tarballNameForPackage(packageName, version) {
  const normalized = packageName.replace(/^@/, "").replace("/", "-");
  return `${normalized}-${version}.tgz`;
}

export function binaryFileName(platform = process.platform) {
  return platform === "win32" ? "pire-browser.exe" : "pire-browser";
}

export function hostFileName(platform = process.platform) {
  return platform === "win32" ? "pire-browser-host.exe" : "pire-browser-host";
}

export function platformBinaryPath(packageRoot, platform = process.platform) {
  return join(packageRoot, "bin", binaryFileName(platform));
}

export function resolveNativeBinary(options = {}) {
  const root = options.root ?? rootDir();
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  const platform = options.platform ?? process.platform;
  const arch = options.arch ?? process.arch;
  const override = env.PIRE_BROWSER_BINARY || env.PIRE_BROWSER_EXE;
  if (override) {
    const absolute = resolve(override);
    return existsSync(absolute)
      ? { ok: true, path: absolute, source: "env" }
      : { ok: false, reason: `PIRE_BROWSER_BINARY points to a missing file: ${absolute}` };
  }

  let tuple;
  try {
    tuple = platformTuple(platform, arch);
  } catch (error) {
    return { ok: false, reason: error.message };
  }

  const suffix = platform === "win32" ? ".exe" : "";
  for (const candidate of [
    join(root, "cli", "target", "debug", `pire-browser${suffix}`),
    join(root, "cli", "target", "release", `pire-browser${suffix}`),
    join(cwd, "target", "debug", `pire-browser${suffix}`),
    join(cwd, "target", "release", `pire-browser${suffix}`),
  ]) {
    if (existsSync(candidate)) return { ok: true, path: candidate, source: "development", tuple };
  }

  const packageName = packageNameForTuple(tuple);
  const requireFromRoot = createRequire(join(root, "package.json"));
  try {
    const packageJsonPath = requireFromRoot.resolve(`${packageName}/package.json`);
    const packageRoot = dirname(packageJsonPath);
    const candidate = platformBinaryPath(packageRoot, platform);
    if (existsSync(candidate)) return { ok: true, path: candidate, source: packageName, tuple };
  } catch {
    // Fall through to the transitional checked-in binary and then the optional-dependency diagnostic.
  }

  const checkedInCandidate = join(root, "bin", tuple, `pire-browser${suffix}`);
  if (existsSync(checkedInCandidate)) return { ok: true, path: checkedInCandidate, source: "development", tuple };

  const version = rootPackageJson(root).version;
  return {
    ok: false,
    tuple,
    packageName,
    reason:
      `Missing optional native package ${packageName}@${version} for ${tuple}. ` +
      `Reinstall with optional dependencies enabled: npm install -g pire-browser@${version} --include=optional`,
  };
}
