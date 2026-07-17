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

export function detectPiInstallContext(packageRoot, env = process.env) {
  const absolute = resolve(packageRoot);
  for (const agentDir of configuredPiAgentDirs(env)) {
    const expectedRoot = resolve(join(agentDir, "npm", "node_modules", PACKAGE_NAME));
    if (!sameFilesystemPath(absolute, expectedRoot)) continue;
    return {
      kind: "global",
      packageRoot: absolute,
      installRoot: join(agentDir, "npm"),
      settingsPath: join(agentDir, "settings.json"),
    };
  }
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
      installRoot: join(settingsRoot, "npm"),
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

export function inspectPiSettingsForConflicts(settingsPath) {
  return inspectPiSettingsReadResult(settingsPath, readPiSettings(settingsPath));
}

export function advancePiSettingsPireBrowserVersion(settingsPath, targetVersion, { dryRun = false } = {}) {
  if (!isExactSemver(targetVersion)) {
    return { ok: false, changed: false, reason: "invalid_target_version", settingsPath, targetVersion };
  }
  const readResult = readPiSettings(settingsPath);
  if (!readResult.ok) {
    return { ok: false, changed: false, reason: readResult.reason, settingsPath, targetVersion };
  }
  const settings = readResult.settings;
  if (!Array.isArray(settings?.packages)) {
    return { ok: false, changed: false, reason: "missing_packages", settingsPath, targetVersion };
  }

  let found = false;
  let changed = false;
  const packages = settings.packages.map((entry) => {
    const source = packageSource(entry);
    if (!isPireBrowserNpmSource(source)) return entry;
    found = true;
    const nextSource = advanceExactPireBrowserSource(source, targetVersion);
    if (nextSource === source) return entry;
    changed = true;
    return typeof entry === "string" ? nextSource : { ...entry, source: nextSource };
  });
  if (!found) {
    return { ok: false, changed: false, reason: "missing_npm_source", settingsPath, targetVersion };
  }
  if (!changed) {
    return {
      ok: true,
      changed: false,
      reason: "source_channel_preserved",
      settingsPath,
      targetVersion,
    };
  }
  let backupPath = null;
  if (!dryRun) {
    try {
      backupPath = nextSettingsUpdateBackupPath(settingsPath);
      copyFileSync(settingsPath, backupPath);
      settings.packages = packages;
      atomicWriteJson(settingsPath, settings);
    } catch (error) {
      return {
        ok: false,
        changed: false,
        reason: "settings_write_failed",
        settingsPath,
        targetVersion,
        backupPath,
        writeError: error.message,
      };
    }
  } else {
    try {
      backupPath = nextSettingsUpdateBackupPath(settingsPath);
    } catch (error) {
      return {
        ok: false,
        changed: false,
        reason: "settings_write_failed",
        settingsPath,
        targetVersion,
        writeError: error.message,
      };
    }
  }
  return {
    ok: true,
    changed: !dryRun,
    wouldChange: true,
    dryRun,
    reason: dryRun ? "would_advance_exact_pin" : "advanced_exact_pin",
    settingsPath,
    targetVersion,
    backupPath,
  };
}

function readPiSettings(settingsPath) {
  if (!existsSync(settingsPath)) {
    return { ok: false, reason: "missing_settings", settings: null };
  }

  try {
    return { ok: true, reason: "ok", settings: JSON.parse(readFileSync(settingsPath, "utf8")) };
  } catch (error) {
    return { ok: false, reason: `invalid_settings: ${error.message}`, settings: null };
  }
}

function inspectPiSettingsReadResult(settingsPath, readResult) {
  if (!readResult.ok) return emptyInspection(settingsPath, readResult.reason);

  const settings = readResult.settings;

  const packages = Array.isArray(settings?.packages) ? settings.packages : [];
  const packageConflicts = [];
  let npmSourcePresent = false;
  for (const entry of packages) {
    const source = packageSource(entry);
    if (isPireBrowserNpmSource(source)) {
      npmSourcePresent = true;
      continue;
    }
    const classification = classifyPireBrowserSource(source, settingsPath);
    if (classification.conflict) {
      packageConflicts.push({
        type: "package",
        kind: classification.kind,
        source,
        removableByDefault: classification.kind !== "local-checkout",
      });
    }
  }

  const shim = inspectLegacyPireBrowserExtensionShim(settingsPath);
  const managedDirs = legacyManagedInstallDirConflicts(settingsPath).map((path) => ({
    type: "managed-directory",
    kind: "managed-github-dir",
    path,
    removableByDefault: true,
  }));
  const shims = shim.found
    ? [
        {
          type: "extension-shim",
          kind: "zip-shim",
          path: shim.shimPath,
          removableByDefault: true,
        },
      ]
    : [];

  return {
    settingsPath,
    reason: Array.isArray(settings?.packages) ? "ok" : "missing_packages",
    npmSourcePresent,
    conflicts: [...packageConflicts, ...shims, ...managedDirs],
    packageConflicts,
    localConflicts: packageConflicts.filter((conflict) => conflict.kind === "local-checkout"),
    shims,
    managedDirs,
  };
}

export function migratePiSettingsForKnownLegacySources(
  settingsPath,
  { requireNpmSource = true, includeLocal = false, dryRun = false } = {}
) {
  const readResult = readPiSettings(settingsPath);
  const inspection = inspectPiSettingsReadResult(settingsPath, readResult);
  if (inspection.reason === "missing_settings" || inspection.reason.startsWith("invalid_settings:")) {
    return migrationNoChange(settingsPath, inspection.reason);
  }

  if (inspection.reason === "missing_packages") {
    return migrationNoChange(settingsPath, "missing_packages");
  }

  if (requireNpmSource && !inspection.npmSourcePresent) {
    return migrationNoChange(settingsPath, "missing_npm_source", {
      localSkipped: inspection.localConflicts.map((conflict) => conflict.source),
    });
  }

  const removed = [];
  const localSkipped = [];
  const settings = readResult.settings;
  const packages = settings.packages.filter((entry) => {
    const source = packageSource(entry);
    const classification = classifyPireBrowserSource(source, settingsPath);
    if (!classification.conflict) return true;
    if (classification.kind === "local-checkout" && !includeLocal) {
      localSkipped.push(source);
      return true;
    }
    removed.push(source);
    return false;
  });
  const removedShim = removeLegacyPireBrowserExtensionShim(settingsPath, { dryRun });
  const quarantined = quarantineLegacyManagedInstallDirs(settingsPath, { dryRun });

  if (removed.length === 0 && !removedShim.removed && quarantined.quarantinedDirs.length === 0) {
    return {
      changed: false,
      dryRun,
      wouldChange: false,
      removed,
      localSkipped,
      removedShims: [],
      quarantinedDirs: [],
      directoryBackupPaths: [],
      ...(quarantined.quarantineErrors.length > 0 ? { quarantineErrors: quarantined.quarantineErrors } : {}),
      reason:
        quarantined.quarantineErrors.length > 0
          ? "legacy_directory_quarantine_failed"
          : localSkipped.length > 0
            ? "local_conflicts_skipped"
            : "no_legacy_source",
      settingsPath,
    };
  }

  let backupPath = null;
  if (removed.length > 0) {
    backupPath = `${settingsPath}.pire-browser-migration.bak`;
    if (!dryRun) {
      try {
        if (!existsSync(backupPath)) {
          copyFileSync(settingsPath, backupPath);
        }
        settings.packages = packages;
        atomicWriteJson(settingsPath, settings);
      } catch (error) {
        return {
          changed: false,
          dryRun,
          wouldChange: true,
          removed,
          localSkipped,
          removedShims: removedShim.removed ? [removedShim.shimPath] : [],
          quarantinedDirs: quarantined.quarantinedDirs,
          directoryBackupPaths: quarantined.directoryBackupPaths,
          reason: "settings_write_failed",
          settingsPath,
          backupPath,
          writeError: error.message,
        };
      }
    }
  }

  return {
    changed: !dryRun,
    dryRun,
    wouldChange: true,
    removed,
    localSkipped,
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
  return inspectPiSettingsForConflicts(settingsPath).conflicts.length > 0;
}

export function schedulePiPackageMigration(packageRoot, env = process.env) {
  if (env.PIRE_BROWSER_SKIP_PI_PACKAGE_MIGRATION === "1") return { scheduled: false, reason: "disabled" };
  const context = detectPiInstallContext(packageRoot, env);
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

function configuredPiAgentDirs(env) {
  const dirs = [];
  if (env.PI_CODING_AGENT_DIR) {
    const configured = resolve(env.PI_CODING_AGENT_DIR);
    const last = configured.split(/[\\/]+/).pop()?.toLowerCase();
    dirs.push(last === "agent" ? configured : join(configured, "agent"));
  }
  if (env.PI_HOME) dirs.push(join(resolve(env.PI_HOME), "agent"));
  return dirs.filter((path, index) => dirs.findIndex((candidate) => sameFilesystemPath(candidate, path)) === index);
}

function sameFilesystemPath(left, right) {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isExactSemver(value) {
  return /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value ?? "");
}

function advanceExactPireBrowserSource(source, targetVersion) {
  const match = /^(npm:(?:@ryenw\/)?pire-browser)@(.+)$/i.exec(String(source).trim());
  if (!match || !isExactSemver(match[2])) return source;
  return `${match[1]}@${targetVersion}`;
}

function nextSettingsUpdateBackupPath(settingsPath) {
  const base = `${settingsPath}.pire-browser-update.bak`;
  if (!existsSync(base)) return base;
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${base}.${index}`;
    if (!existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not find available settings backup path for ${settingsPath}`);
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

function quarantineLegacyManagedInstallDirs(settingsPath, { dryRun = false } = {}) {
  const quarantinedDirs = [];
  const directoryBackupPaths = [];
  const quarantineErrors = [];

  for (const packageRoot of legacyManagedInstallDirConflicts(settingsPath)) {
    const backupPath = nextBackupPath(packageRoot);
    if (dryRun) {
      quarantinedDirs.push(packageRoot);
      directoryBackupPaths.push(backupPath);
      continue;
    }
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

function legacyManagedInstallDirConflicts(settingsPath) {
  return legacyManagedInstallDirs(settingsPath).filter(
    (packageRoot) => existsSync(packageRoot) && isPireBrowserPackageRoot(packageRoot)
  );
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

function removeLegacyPireBrowserExtensionShim(settingsPath, { dryRun = false } = {}) {
  const shim = inspectLegacyPireBrowserExtensionShim(settingsPath);
  if (!shim.found) return { removed: false, shimPath: shim.shimPath };
  const backupPath = `${shim.shimPath}.pire-browser-migration.bak`;
  if (dryRun) return { removed: true, shimPath: shim.shimPath, backupPath };
  try {
    if (!existsSync(backupPath)) {
      copyFileSync(shim.shimPath, backupPath);
    }
    unlinkSync(shim.shimPath);
    return { removed: true, shimPath: shim.shimPath, backupPath };
  } catch {
    return { removed: false, shimPath: shim.shimPath };
  }
}

function inspectLegacyPireBrowserExtensionShim(settingsPath) {
  const shimPath = join(dirname(settingsPath), "extensions", "pire-browser.ts");
  if (!existsSync(shimPath)) return { found: false, shimPath };
  try {
    const content = readFileSync(shimPath, "utf8");
    return { found: isLegacyPireBrowserExtensionShim(content), shimPath };
  } catch {
    return { found: false, shimPath };
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

function classifyPireBrowserSource(source, settingsPath) {
  if (isPireBrowserNpmSource(source)) return { conflict: false, kind: "npm" };
  if (isKnownLegacyPiSource(source)) return { conflict: true, kind: "legacy-github" };
  if (isLocalPireBrowserSource(source, settingsPath)) return { conflict: true, kind: "local-checkout" };
  return { conflict: false, kind: "other" };
}

function emptyInspection(settingsPath, reason) {
  return {
    settingsPath,
    reason,
    npmSourcePresent: false,
    conflicts: [],
    packageConflicts: [],
    localConflicts: [],
    shims: [],
    managedDirs: [],
  };
}

function migrationNoChange(settingsPath, reason, extra = {}) {
  return {
    changed: false,
    removed: [],
    localSkipped: [],
    removedShims: [],
    quarantinedDirs: [],
    directoryBackupPaths: [],
    reason,
    settingsPath,
    ...extra,
  };
}

function atomicWriteJson(path, value) {
  const tempPath = `${path}.pire-browser-migration.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tempPath, path);
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
