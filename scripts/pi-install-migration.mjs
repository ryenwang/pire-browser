import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
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
export const DEFAULT_DELAY_MS = 100;
export const DEFAULT_POLL_MS = 100;
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
  return KNOWN_LEGACY_PI_SOURCES.some((candidate) => normalized === normalizeSource(candidate));
}

export function isPireBrowserNpmSource(source) {
  const normalized = normalizeSource(source);
  return normalized === PACKAGE_SOURCE || normalized === "npm:@ryenw/pire-browser";
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
    if (!isKnownLegacyPiSource(source)) return true;
    removed.push(source);
    return false;
  });

  if (removed.length === 0) {
    return { changed: false, removed, reason: "no_legacy_source", settingsPath };
  }

  const backupPath = `${settingsPath}.pire-browser-migration.bak`;
  if (!existsSync(backupPath)) {
    copyFileSync(settingsPath, backupPath);
  }

  settings.packages = packages;
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  return { changed: true, removed, reason: "migrated", settingsPath, backupPath };
}

export function hasKnownLegacyPiSource(settingsPath) {
  if (!existsSync(settingsPath)) return false;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
    return Array.isArray(settings.packages) && settings.packages.some((entry) => isKnownLegacyPiSource(packageSource(entry)));
  } catch {
    return false;
  }
}

export function schedulePiPackageMigration(packageRoot, env = process.env) {
  if (env.PIRE_BROWSER_SKIP_PI_PACKAGE_MIGRATION === "1") return { scheduled: false, reason: "disabled" };
  const context = detectPiInstallContext(packageRoot);
  if (!context) return { scheduled: false, reason: "not_pi_managed" };
  if (!hasKnownLegacyPiSource(context.settingsPath)) return { scheduled: false, reason: "no_legacy_source", ...context };

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
  return String(source ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\.git(?=(@|#|$))/i, "")
    .replace(/[@#].*$/, "")
    .toLowerCase();
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
