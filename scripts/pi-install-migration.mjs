import { copyFileSync, existsSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const KNOWN_LEGACY_PI_SOURCES = [
  "git:github.com/ryenwang/pire-browser",
  "git:https://github.com/ryenwang/pire-browser",
  "git+https://github.com/ryenwang/pire-browser",
  "https://github.com/ryenwang/pire-browser",
  "github.com/ryenwang/pire-browser",
  "github:ryenwang/pire-browser",
];

const PACKAGE_SOURCE = "npm:pire-browser";
const PACKAGE_NAME = "pire-browser";
const PACKAGE_EXTENSION_PATH = join("pi", "extensions", "pire-browser.ts");
export const DEFAULT_DELAY_MS = 0;
export const DEFAULT_POLL_MS = 50;
const DEFAULT_TIMEOUT_MS = 30000;

export function detectPiInstallContext(packageRoot) {
  const absolute = resolve(packageRoot);
  const parts = absolute.split(/[\\/]+/);
  const lower = parts.map((part) => part.toLowerCase());
  const suffixes = [
    { kind: "global", suffix: [".pi", "agent", "npm", "node_modules", "pire-browser"], settingsIndex: 1 },
    { kind: "project", suffix: [".pi", "npm", "node_modules", "pire-browser"], settingsIndex: 0 },
  ];

  for (const candidate of suffixes) {
    const start = lower.length - candidate.suffix.length;
    if (start < 0) continue;
    if (!candidate.suffix.every((part, index) => lower[start + index] === part)) continue;
    const settingsRoot = parts.slice(0, start + candidate.settingsIndex + 1).join(sep);
    return {
      kind: candidate.kind,
      packageRoot: absolute,
      settingsPath: join(settingsRoot, "settings.json"),
    };
  }

  return null;
}

export function packageSource(entry) {
  if (typeof entry === "string") return entry;
  if (entry && typeof entry === "object" && typeof entry.source === "string") return entry.source;
  return "";
}

export function isKnownLegacyPiSource(source) {
  const normalized = normalizeSource(source);
  if (legacyRepoSlug(normalized) === "ryenwang/pire-browser") return true;
  return KNOWN_LEGACY_PI_SOURCES.some((candidate) => normalized === normalizeSource(candidate));
}

export function isPireBrowserNpmSource(source) {
  const normalized = normalizeSource(source);
  return normalized === PACKAGE_SOURCE || normalized === "npm:@ryenw/pire-browser";
}

export function isConflictingPireBrowserSource(source, settingsPath) {
  if (isPireBrowserNpmSource(source)) return false;
  if (isKnownLegacyPiSource(source)) return true;
  return isLocalPireBrowserSource(source, settingsPath);
}

export function migratePiSettingsForKnownLegacySources(settingsPath, { requireNpmSource = true } = {}) {
  if (!existsSync(settingsPath)) {
    return { changed: false, removed: [], reason: "missing_settings", settingsPath };
  }

  let settings;
  try {
    settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  } catch (error) {
    return { changed: false, removed: [], reason: `invalid_settings: ${error.message}`, settingsPath };
  }

  if (!Array.isArray(settings.packages)) {
    return { changed: false, removed: [], reason: "missing_packages", settingsPath };
  }

  if (requireNpmSource && !settings.packages.some((entry) => isPireBrowserNpmSource(packageSource(entry)))) {
    return { changed: false, removed: [], reason: "missing_npm_source", settingsPath };
  }

  const removed = [];
  const packages = settings.packages.filter((entry) => {
    const source = packageSource(entry);
    if (!isConflictingPireBrowserSource(source, settingsPath)) return true;
    removed.push(source);
    return false;
  });
  const removedShim = removeLegacyPireBrowserExtensionShim(settingsPath);
  const quarantined = quarantineLegacyManagedInstallDirs(settingsPath);

  if (removed.length === 0 && !removedShim.removed && quarantined.quarantinedDirs.length === 0) {
    return {
      changed: false,
      removed,
      removedShims: [],
      quarantinedDirs: [],
      directoryBackupPaths: [],
      ...(quarantined.quarantineErrors.length > 0 ? { quarantineErrors: quarantined.quarantineErrors } : {}),
      reason: quarantined.quarantineErrors.length > 0 ? "legacy_directory_quarantine_failed" : "no_legacy_source",
      settingsPath,
    };
  }

  let backupPath = null;
  if (removed.length > 0) {
    backupPath = `${settingsPath}.pire-browser-migration.bak`;
    if (!existsSync(backupPath)) {
      copyFileSync(settingsPath, backupPath);
    }
    settings.packages = packages;
    writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  }

  return {
    changed: true,
    removed,
    removedShims: removedShim.removed ? [removedShim.shimPath] : [],
    quarantinedDirs: quarantined.quarantinedDirs,
    directoryBackupPaths: quarantined.directoryBackupPaths,
    ...(quarantined.quarantineErrors.length > 0 ? { quarantineErrors: quarantined.quarantineErrors } : {}),
    reason: "migrated",
    settingsPath,
    ...(backupPath ? { backupPath } : {}),
    ...(removedShim.backupPath ? { shimBackupPath: removedShim.backupPath } : {}),
  };
}

export function hasKnownLegacyPiSource(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    return (
      Array.isArray(settings.packages) &&
      settings.packages.some((entry) => isConflictingPireBrowserSource(packageSource(entry), settingsPath))
    );
  } catch {
    return false;
  }
}

export function schedulePiPackageMigration(packageRoot, env = process.env) {
  if (env.PIRE_BROWSER_SKIP_PI_PACKAGE_MIGRATION === "1") return { scheduled: false, reason: "disabled" };
  const context = detectPiInstallContext(packageRoot);
  if (!context) return { scheduled: false, reason: "not_pi_managed" };

  const script = fileURLToPath(import.meta.url);
  const child = spawn(
    process.execPath,
    [
      script,
      "--worker",
      "--settings",
      context.settingsPath,
      "--delay-ms",
      String(DEFAULT_DELAY_MS),
      "--poll-ms",
      String(DEFAULT_POLL_MS),
      "--timeout-ms",
      String(DEFAULT_TIMEOUT_MS),
    ],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...env, PIRE_BROWSER_DISABLE_UPDATE_CHECK: "1" },
    }
  );
  child.unref();
  return { scheduled: true, reason: "scheduled", ...context };
}

function normalizeSource(source) {
  let text = String(source ?? "")
    .trim()
    .replace(/\\/g, "/")
    .toLowerCase();
  text = text.replace(/#.*$/, "");
  text = text.replace(/\.git(?=(@|$))/i, "");
  const lastPathSeparator = Math.max(text.lastIndexOf("/"), text.lastIndexOf(":"));
  const refIndex = text.indexOf("@", lastPathSeparator + 1);
  if (refIndex !== -1) text = text.slice(0, refIndex);
  return text;
}

function legacyRepoSlug(source) {
  let text = source;
  if (text.startsWith("git:")) text = text.slice("git:".length);
  if (text.startsWith("git+")) text = text.slice("git+".length);
  text = text
    .replace(/^https?:\/\/(?:www\.)?github\.com\//, "github.com/")
    .replace(/^ssh:\/\/git@github\.com\//, "github.com/")
    .replace(/^git@github\.com:/, "github.com/")
    .replace(/^github:/, "github.com/");
  if (text.startsWith("github.com/")) return text.slice("github.com/".length);
  return "";
}

function isLocalPireBrowserSource(source, settingsPath) {
  const raw = String(source ?? "").trim();
  if (!raw || raw.startsWith("npm:") || raw.startsWith("git:") || /^[a-z]+:\/\//i.test(raw)) return false;
  if (/^[\w.-]+\/[\w.-]+\/[\w./-]+$/i.test(raw) && !raw.startsWith(".") && !raw.includes(":")) {
    return false;
  }
  const baseDir = dirname(settingsPath);
  const candidatePath = resolve(baseDir, raw);
  const packageRoot = localPackageRoot(candidatePath);
  if (!packageRoot) return false;
  return isPireBrowserPackageRoot(packageRoot);
}

function localPackageRoot(candidatePath) {
  try {
    const stat = statSync(candidatePath);
    if (stat.isDirectory()) return candidatePath;
    if (stat.isFile()) return dirname(candidatePath);
  } catch {
    return null;
  }
  return null;
}

function isPireBrowserPackageRoot(packageRoot) {
  try {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    return packageJson?.name === PACKAGE_NAME && existsSync(join(packageRoot, PACKAGE_EXTENSION_PATH));
  } catch {
    return false;
  }
}

function quarantineLegacyManagedInstallDirs(settingsPath) {
  const quarantinedDirs = [];
  const directoryBackupPaths = [];
  const quarantineErrors = [];

  for (const packageRoot of legacyManagedInstallDirs(settingsPath)) {
    if (!existsSync(packageRoot)) continue;
    if (!isPireBrowserPackageRoot(packageRoot)) continue;

    const backupPath = nextBackupPath(packageRoot);
    try {
      renameSync(packageRoot, backupPath);
      quarantinedDirs.push(packageRoot);
      directoryBackupPaths.push(backupPath);
    } catch (error) {
      quarantineErrors.push(`${packageRoot}: ${error.message}`);
    }
  }

  return { quarantinedDirs, directoryBackupPaths, quarantineErrors };
}

function legacyManagedInstallDirs(settingsPath) {
  const settingsRoot = dirname(settingsPath);
  return [join(settingsRoot, "git", "github.com", "ryenwang", "pire-browser")];
}

function nextBackupPath(path) {
  const base = `${path}.pire-browser-migration.bak`;
  if (!existsSync(base)) return base;
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${base}.${index}`;
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not find available backup path for ${path}`);
}

function removeLegacyPireBrowserExtensionShim(settingsPath) {
  const shimPath = join(dirname(settingsPath), "extensions", "pire-browser.ts");
  if (!existsSync(shimPath)) return { removed: false, shimPath };
  try {
    const content = readFileSync(shimPath, "utf8");
    if (!isLegacyPireBrowserExtensionShim(content)) return { removed: false, shimPath };
    const backupPath = `${shimPath}.pire-browser-migration.bak`;
    if (!existsSync(backupPath)) {
      copyFileSync(shimPath, backupPath);
    }
    unlinkSync(shimPath);
    return { removed: true, shimPath, backupPath };
  } catch {
    return { removed: false, shimPath };
  }
}

function isLegacyPireBrowserExtensionShim(content) {
  const normalized = String(content ?? "").replace(/\\/g, "/");
  return (
    normalized.includes("pathToFileURL") &&
    normalized.includes("pi/extensions/pire-browser.ts") &&
    normalized.includes("pire-browser")
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const options = {
    worker: false,
    settingsPath: null,
    delayMs: DEFAULT_DELAY_MS,
    pollMs: DEFAULT_POLL_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--worker") options.worker = true;
    else if (arg === "--settings") {
      options.settingsPath = argv[index + 1];
      index += 1;
    } else if (arg === "--delay-ms") {
      options.delayMs = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
    } else if (arg === "--poll-ms") {
      options.pollMs = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
    } else if (arg === "--timeout-ms") {
      options.timeoutMs = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
    } else {
      throw new Error(`Unknown pi install migration argument: ${arg}`);
    }
  }
  return options;
}

export function shouldRetryMigrationReason(reason) {
  return (
    reason === "missing_settings" ||
    reason === "missing_packages" ||
    reason === "missing_npm_source" ||
    String(reason).startsWith("invalid_settings:")
  );
}

export async function runWorker(options) {
  if (!options.settingsPath) throw new Error("--settings is required");
  await sleep(Number.isFinite(options.delayMs) ? options.delayMs : DEFAULT_DELAY_MS);
  const startedAt = Date.now();
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const pollMs = Number.isFinite(options.pollMs) ? options.pollMs : DEFAULT_POLL_MS;

  while (Date.now() - startedAt <= timeoutMs) {
    const result = migratePiSettingsForKnownLegacySources(options.settingsPath, { requireNpmSource: true });
    if (result.changed || !shouldRetryMigrationReason(result.reason)) return result;
    await sleep(pollMs);
  }

  return { changed: false, removed: [], reason: "timeout", settingsPath: options.settingsPath };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (!options.worker) {
      throw new Error("This script is an internal pire-browser postinstall helper.");
    }
    await runWorker(options);
  } catch {
    process.exit(0);
  }
}
