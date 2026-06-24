#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveNativeBinary, rootDir, rootPackageJson } from "../scripts/platform.mjs";

const root = rootDir();
const packageJson = rootPackageJson(root);
const args = process.argv.slice(2);

if (args[0] === "update") {
  const status = handleUpdate(args.slice(1));
  process.exit(status);
}

if (args[0] === "upgrade") {
  const status = handleUpgrade(args.slice(1));
  process.exit(status);
}

maybeStartBackgroundUpdateCheck(args);
const resolved = resolveNativeBinary({ root });
if (!resolved.ok) {
  console.error(`pire-browser: ${resolved.reason}`);
  process.exit(1);
}

const result = runNative(resolved.path, args);
maybeStartBackgroundPatchApply(args);
if (result.error) {
  console.error(`pire-browser: failed to run ${resolved.path}: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) process.kill(process.pid, result.signal);
process.exit(result.status ?? 1);

function nativeEnv() {
  const env = { ...process.env };
  const extensionDir = join(root, "extension");
  if (!env.PIRE_BROWSER_EXTENSION_DIR && existsSync(join(extensionDir, "manifest.json"))) {
    env.PIRE_BROWSER_EXTENSION_DIR = extensionDir;
  }
  return env;
}

function runNative(binary, nativeArgs) {
  const env = nativeEnv();
  if (process.platform !== "win32") {
    return spawnSync(binary, nativeArgs, { stdio: "inherit", windowsHide: true, env });
  }

  const tempDir = mkdtempSync(join(tmpdir(), "pire-browser-native-"));
  const stdoutPath = join(tempDir, "stdout.log");
  const stderrPath = join(tempDir, "stderr.log");
  let stdoutFd;
  let stderrFd;
  try {
    stdoutFd = openSync(stdoutPath, "w");
    stderrFd = openSync(stderrPath, "w");
    const result = spawnSync(binary, nativeArgs, {
      stdio: ["ignore", stdoutFd, stderrFd],
      windowsHide: true,
      env,
    });
    closeIfOpen(stdoutFd);
    closeIfOpen(stderrFd);
    stdoutFd = undefined;
    stderrFd = undefined;
    forwardFile(stdoutPath, process.stdout);
    forwardFile(stderrPath, process.stderr);
    return result;
  } finally {
    closeIfOpen(stdoutFd);
    closeIfOpen(stderrFd);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function closeIfOpen(fd) {
  if (fd === undefined) return;
  try {
    closeSync(fd);
  } catch {
    // Best-effort cleanup for launcher diagnostics.
  }
}

function forwardFile(path, stream) {
  if (!existsSync(path)) return;
  const body = readFileSync(path, "utf8");
  if (body) stream.write(body);
}

function handleUpdate(updateArgs) {
  const background = removeFlag(updateArgs, "--background");
  const backgroundWorker = removeFlag(updateArgs, "--background-worker");
  const delayMs = Number(removeValueFlag(updateArgs, "--delay-ms") ?? 0);
  const json = removeFlag(updateArgs, "--json");
  const subcommand = updateArgs.shift() ?? "check";
  if (subcommand === "configure") return configureUpdate(updateArgs, json);
  if (subcommand === "check") return checkUpdate({ json, background });
  if (subcommand === "apply") return applyUpdate({ json, background, backgroundWorker, delayMs });
  return outputUpdateError(`unsupported update command: ${subcommand}`, json, background);
}

function handleUpgrade(upgradeArgs) {
  const json = removeFlag(upgradeArgs, "--json");
  if (upgradeArgs.length > 0) {
    return outputUpdateError(`unsupported upgrade option: ${upgradeArgs[0]}`, json, false);
  }
  const checkStatus = checkUpdate({ json: false, background: false, silent: true });
  if (checkStatus !== 0) return checkStatus;
  return applyUpdate({ json, background: false });
}

function configureUpdate(updateArgs, json) {
  let mode = null;
  for (let i = 0; i < updateArgs.length; i += 1) {
    if (updateArgs[i] === "--mode") {
      mode = updateArgs[i + 1] ?? null;
      i += 1;
      continue;
    }
    return outputUpdateError(`unsupported update configure option: ${updateArgs[i]}`, json, false);
  }
  if (!["off", "notify", "patch"].includes(mode)) {
    return outputUpdateError("update configure requires --mode off|notify|patch", json, false);
  }
  const config = readUpdateConfig();
  config.mode = mode;
  writeJson(configPath(), config);
  outputUpdate({ mode }, json);
  return 0;
}

function checkUpdate({ json, background, silent = false }) {
  const currentVersion = packageJson.version;
  if (isOfflineEnv()) {
    const update = {
      checkedAt: Date.now(),
      available: false,
      kind: "offline",
      currentVersion,
      latestVersion: null,
      offline: true,
    };
    if (!background && !silent) outputUpdate({ update }, json);
    return 0;
  }
  const latest = npmViewLatest(background ? 3_000 : 15_000);
  const checkedAt = Date.now();
  const recommendation = latest
    ? classifyUpdate(currentVersion, latest)
    : { available: false, kind: "unknown", currentVersion, latestVersion: null };
  const cache = { checkedAt, ...recommendation };
  writeJson(cachePath(), cache);
  if (!background && !silent) outputUpdate({ update: cache }, json);
  return 0;
}

function applyUpdate({ json, background, backgroundWorker = false, delayMs = 0 }) {
  if (isOfflineEnv()) return outputUpdateResult("offline", "offline mode is enabled", json, background);
  const config = readUpdateConfig();
  if (config.mode === "off") return outputUpdateResult("disabled", "update mode is off", json, background);
  const cache = readJson(cachePath()) ?? {};
  if (!cache.available) {
    const message = cache.kind === "none" ? "already current" : "no cached update is available";
    return outputUpdateResult("current", message, json, background);
  }
  if (cache.kind !== "patch") return outputUpdateResult("notify", "minor and major updates are notify-only", json, background);
  const installKind = detectInstallKind();
  if (!["global", "pi"].includes(installKind.kind)) {
    return outputUpdateResult("notify", "local project installs are notify-only", json, background);
  }
  if (hasActiveManagedSession()) {
    return outputUpdateResult("deferred", "managed Firefox sessions are active", json, background);
  }
  if (background && process.platform === "win32" && !backgroundWorker) {
    spawnDetached(process.execPath, [
      fileURLToPath(import.meta.url),
      "update",
      "apply",
      "--background",
      "--background-worker",
      "--delay-ms",
      "1500",
      "--json",
    ]);
    return 0;
  }
  if (delayMs > 0) sleep(delayMs);
  const command =
    installKind.kind === "pi"
      ? ["pi", ["update", "npm:pire-browser"]]
      : ["npm", ["install", "-g", `pire-browser@${cache.latestVersion}`, "--include=optional"]];
  const maxAttempts = backgroundWorker ? 3 : 1;
  let lastStatus = 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runInstallCommand(command, background);
    if (result.status === 0) {
      return outputUpdateResult("applied", `updated to ${cache.latestVersion}`, json, background);
    }
    lastStatus = result.status ?? 1;
    if (attempt >= maxAttempts || !isLockLikeFailure(result)) break;
    sleep(750 * attempt);
  }
  return outputUpdateResult("failed", `update command exited with ${lastStatus}`, json, background, 1);
}

function maybeStartBackgroundUpdateCheck(commandArgs) {
  if (process.env.PIRE_BROWSER_DISABLE_UPDATE_CHECK === "1") return;
  if (isOfflineEnv()) return;
  if (isObservationalCommand(commandArgs)) return;
  const config = readUpdateConfig();
  if (config.mode === "off") return;
  const cache = readJson(cachePath());
  if (cache?.checkedAt && Date.now() - cache.checkedAt < 24 * 60 * 60 * 1000) return;
  spawnDetached(process.execPath, [fileURLToPath(import.meta.url), "update", "check", "--background", "--json"]);
}

function maybeStartBackgroundPatchApply(commandArgs) {
  if (process.env.PIRE_BROWSER_DISABLE_UPDATE_CHECK === "1") return;
  if (isOfflineEnv()) return;
  if (isObservationalCommand(commandArgs)) return;
  const config = readUpdateConfig();
  if (config.mode !== "patch") return;
  const cache = readJson(cachePath());
  if (!cache?.available || cache.kind !== "patch") return;
  spawnDetached(process.execPath, [fileURLToPath(import.meta.url), "update", "apply", "--background", "--json"]);
}

function isObservationalCommand(commandArgs) {
  const rootCommand = commandArgs.find((arg) => !arg.startsWith("-")) ?? "help";
  return ["help", "status", "doctor", "install-status", "skills", "skill", "update"].includes(rootCommand);
}

function npmViewLatest(timeout) {
  const result = spawnSync("npm", ["view", "pire-browser", "version", "--json"], {
    encoding: "utf8",
    timeout,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function classifyUpdate(currentVersion, latestVersion) {
  const current = parseSemver(currentVersion);
  const latest = parseSemver(latestVersion);
  if (!current || !latest || compareSemver(latest, current) <= 0) {
    return { available: false, kind: "none", currentVersion, latestVersion };
  }
  const kind = latest.major !== current.major ? "major" : latest.minor !== current.minor ? "minor" : "patch";
  return { available: true, kind, currentVersion, latestVersion };
}

function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value ?? "");
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}

function compareSemver(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function detectInstallKind() {
  if (process.env.PIRE_BROWSER_INSTALL_KIND === "pi") return { kind: "pi" };
  if (process.env.PIRE_BROWSER_INSTALL_KIND === "global") return { kind: "global" };
  const piRoot = process.env.PI_CODING_AGENT_DIR || process.env.PI_HOME;
  if (piRoot && root.startsWith(piRoot)) return { kind: "pi" };
  const globalRoot = spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: process.platform === "win32" });
  if (globalRoot.status === 0 && root.startsWith(globalRoot.stdout.trim())) return { kind: "global" };
  if (root.includes(`${separator()}node_modules${separator()}`)) return { kind: "local" };
  return { kind: "local" };
}

function hasActiveManagedSession() {
  const dir = join(dataDir(), "sessions");
  if (!existsSync(dir)) return false;
  const now = Date.now();
  let names;
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return true;
  }
  if (names.length > 50) return true;
  for (const name of names.slice(0, 50)) {
    const session = readJson(join(dir, name));
    if (session?.lastHeartbeatAt && now - session.lastHeartbeatAt <= 15_000) return true;
  }
  return false;
}

function dataDir() {
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? root, "AppData", "Local"), "pire-browser");
  if (process.platform === "darwin") return join(process.env.HOME ?? root, "Library", "Application Support", "pire-browser");
  return join(process.env.XDG_DATA_HOME ?? join(process.env.HOME ?? root, ".local", "share"), "pire-browser");
}

function updateDir() {
  return join(dataDir(), "updates");
}

function configPath() {
  return join(updateDir(), "config.json");
}

function cachePath() {
  return join(updateDir(), "cache.json");
}

function readUpdateConfig() {
  return { mode: "patch", ...(readJson(configPath()) ?? {}) };
}

function isOfflineEnv(env = process.env) {
  return env.PI_OFFLINE === "1" || isTruthy(env.NPM_CONFIG_OFFLINE) || isTruthy(env.npm_config_offline);
}

function isTruthy(value) {
  return value === "1" || String(value).toLowerCase() === "true";
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function outputUpdate(data, json) {
  if (json) {
    console.log(JSON.stringify({ success: true, data }, null, 2));
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

function outputUpdateResult(status, message, json, background, exitCode = 0) {
  if (!background) outputUpdate({ status, message }, json);
  return exitCode;
}

function outputUpdateError(message, json, background) {
  if (!background) {
    if (json) console.log(JSON.stringify({ success: false, error: { code: "invalid_args", message } }, null, 2));
    else console.error(`pire-browser: ${message}`);
  }
  return 2;
}

function removeFlag(values, flag) {
  const index = values.indexOf(flag);
  if (index === -1) return false;
  values.splice(index, 1);
  return true;
}

function removeValueFlag(values, flag) {
  const index = values.indexOf(flag);
  if (index === -1) return null;
  const value = values[index + 1] ?? null;
  values.splice(index, value === null ? 1 : 2);
  return value;
}

function runInstallCommand(command, background) {
  return spawnSync(command[0], command[1], {
    stdio: background ? "pipe" : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

function isLockLikeFailure(result) {
  if (process.platform !== "win32") return false;
  const text = `${result.error?.code ?? ""}\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return /EPERM|EBUSY|EACCES|access is denied|file is being used|being used by another process/i.test(text);
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function spawnDetached(command, commandArgs) {
  const child = spawn(command, commandArgs, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

function separator() {
  return process.platform === "win32" ? "\\" : "/";
}
