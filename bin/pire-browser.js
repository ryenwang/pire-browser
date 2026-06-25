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

export function main(args = process.argv.slice(2)) {
  if (args[0] === "update") {
    return handleUpdate(args.slice(1));
  }

  if (args[0] === "upgrade") {
    return handleUpgrade(args.slice(1));
  }

  const skillsResult = handleLauncherSkills(args);
  if (skillsResult !== null) return skillsResult;

  maybeStartBackgroundUpdateCheck(args);
  const resolved = resolveNativeBinary({ root });
  if (!resolved.ok) {
    console.error(`pire-browser: ${resolved.reason}`);
    return 1;
  }

  const result = runNative(resolved.path, args);
  maybeStartBackgroundPatchApply(args);
  if (result.error) {
    console.error(`pire-browser: failed to run ${resolved.path}: ${result.error.message}`);
    return 1;
  }
  if (result.signal) process.kill(process.pid, result.signal);
  return result.status ?? 1;
}

if (isMain()) {
  process.exit(main(process.argv.slice(2)));
}

function nativeEnv() {
  const env = { ...process.env };
  const extensionDir = join(root, "extension");
  env.PIRE_BROWSER_NODE_PATH ||= process.execPath;
  env.PIRE_BROWSER_LAUNCHER_PATH ||= fileURLToPath(import.meta.url);
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

export function handleLauncherSkills(args, options = {}) {
  const output = options.output ?? console.log;
  const error = options.error ?? console.error;
  if (!["skills", "skill"].includes(args[0])) return null;

  const skillArgs = args.slice(1);
  const json = removeFlag(skillArgs, "--json");
  const subcommand = skillArgs.shift() ?? "list";
  if (subcommand === "list") {
    if (skillArgs.length > 0) {
      return outputSkillsError(`unsupported skills list option: ${skillArgs[0]}`, json, output, error);
    }
    return outputSkillsList(json, output);
  }
  if (subcommand === "cat" || subcommand === "get") {
    const full = removeFlag(skillArgs, "--full");
    void full;
    if (removeFlag(skillArgs, "--all")) {
      if (skillArgs.length > 0) {
        return outputSkillsError(`unsupported skills ${subcommand} option: ${skillArgs[0]}`, json, output, error);
      }
      return outputSkillsCatAll(json, output);
    }
    const name = skillArgs.shift();
    if (!name) {
      return outputSkillsError(`invalid_args: skills ${subcommand} requires <name>`, json, output, error);
    }
    if (skillArgs.length > 0) {
      return outputSkillsError(`unsupported skills ${subcommand} option: ${skillArgs[0]}`, json, output, error);
    }
    return outputSkillsCat(name, json, output, error);
  }
  if (subcommand === "path") {
    const name = skillArgs.shift() ?? "core";
    if (name.startsWith("-")) {
      return outputSkillsError(`unsupported skills path option: ${name}`, json, output, error);
    }
    if (skillArgs.length > 0) {
      return outputSkillsError(`unsupported skills path option: ${skillArgs[0]}`, json, output, error);
    }
    return outputSkillsPath(name, json, output, error);
  }
  if (subcommand.startsWith("-")) {
    return outputSkillsError(`unsupported skills option: ${subcommand}`, json, output, error);
  }
  return outputSkillsError(`unsupported skills command: ${subcommand}; try \`pire-browser skills list\``, json, output, error);
}

function outputSkillsList(json, output) {
  const skills = launcherSkills();
  if (json) output(successEnvelope({ skills }));
  else {
    for (const skill of skills) output(`${skill.name}\t${skill.description}`);
  }
  return 0;
}

function outputSkillsCat(name, json, output, error) {
  const skill = launcherSkillContent(name);
  if (!skill) {
    const available = launcherSkills().map((item) => item.name).join(", ");
    return outputSkillsError(`unknown skill: No skill named \`${name}\`. Available skills: ${available}.`, json, output, error);
  }
  if (json) output(successEnvelope({ skill }));
  else process.stdout.write(skill.content);
  return 0;
}

function outputSkillsCatAll(json, output) {
  const skills = launcherSkills().map((skill) => launcherSkillContent(skill.name)).filter(Boolean);
  if (json) output(successEnvelope({ skills }));
  else process.stdout.write(skills.map((skill) => skill.content).join("\n"));
  return 0;
}

function outputSkillsPath(name, json, output, error) {
  const path = launcherSkillPath(name);
  if (!path) {
    const available = launcherSkills().map((item) => item.name).join(", ");
    return outputSkillsError(`unknown skill: No skill named \`${name}\`. Available skills: ${available}.`, json, output, error);
  }
  const skill = launcherSkillContent(name);
  if (json) output(successEnvelope({ skill: { name, description: skill?.description ?? "", path } }));
  else output(path);
  return 0;
}

function outputSkillsError(message, json, output, error) {
  const cleanMessage = message.replace(/^invalid_args: /, "");
  if (json) {
    output(
      JSON.stringify(
        {
          success: false,
          error: {
            code: message.startsWith("invalid_args:") ? "invalid_args" : "unsupported_command",
            message: cleanMessage,
          },
          warnings: [],
        },
        null,
        2
      )
    );
  } else {
    error(`${message.startsWith("invalid_args:") ? "invalid_args" : "unsupported_command"}: ${cleanMessage}`);
  }
  return 1;
}

function launcherSkills() {
  const names = launcherSkillNames();
  const skills = names
    .map((name) => launcherSkillContent(name))
    .filter(Boolean)
    .map((skill) => ({ name: skill.name, description: skill.description }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (skills.length > 0) return skills;
  if (launcherSkillsRootIsOverride()) return [];
  return [{ name: "core", description: "Core pire-browser workflow for safe Firefox automation." }];
}

function launcherSkillContent(name) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return null;
  const path = launcherSkillFile(name);
  if (!existsSync(path)) return null;
  const content = normalizeSkillText(readFileSync(path, "utf8"));
  const frontmatter = skillFrontmatter(content);
  if (!frontmatter || frontmatter.name !== name) return null;
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    content,
  };
}

function launcherSkillPath(name) {
  if (!launcherSkillContent(name)) return null;
  return dirname(launcherSkillFile(name));
}

function launcherSkillFile(name) {
  return join(launcherSkillsRoot(), name, "SKILL.md");
}

function launcherSkillsRoot(env = process.env) {
  return nonEmptyEnv(env.PIRE_BROWSER_SKILLS_DIR) ?? nonEmptyEnv(env.AGENT_BROWSER_SKILLS_DIR) ?? join(root, "skill-data");
}

function launcherSkillsRootIsOverride(env = process.env) {
  return Boolean(nonEmptyEnv(env.PIRE_BROWSER_SKILLS_DIR) ?? nonEmptyEnv(env.AGENT_BROWSER_SKILLS_DIR));
}

function nonEmptyEnv(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function launcherSkillNames() {
  const skillRoot = launcherSkillsRoot();
  try {
    return readdirSync(skillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^[A-Za-z0-9_.-]+$/.test(name))
      .filter((name) => existsSync(join(skillRoot, name, "SKILL.md")));
  } catch {
    return [];
  }
}

function skillFrontmatter(content) {
  const lines = content.split("\n");
  if (lines.shift() !== "---") return null;
  let name = "";
  let description = "";
  for (const line of lines) {
    if (line === "---") break;
    const index = line.indexOf(":");
    if (index === -1) return null;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^"(.*)"$/, "$1");
    if (key === "name") name = value;
    if (key === "description") description = value;
  }
  if (!name) return null;
  return { name, description };
}

function normalizeSkillText(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function successEnvelope(data) {
  return JSON.stringify({ success: true, data, warnings: [] }, null, 2);
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
  const update = getUpdateRecommendation({ background: false });
  if (update.kind === "offline") {
    return outputUpdateResult("offline", "offline mode is enabled", json, false, 0, { operation: "upgrade", update });
  }
  if (update.kind === "unknown") {
    return outputUpdateResult(
      "unknown",
      "could not check the npm registry",
      json,
      false,
      1,
      {
        operation: "upgrade",
        update,
        nextAction: "Check network access or run `pire-browser update check --json` for details.",
      }
    );
  }
  if (!update.available) {
    return outputUpdateResult("current", "already current", json, false, 0, { operation: "upgrade", update });
  }
  return applyUpdate({ json, background: false, update, allowAnySemver: true, upgrade: true, operation: "upgrade" });
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
  const update = getUpdateRecommendation({ background });
  if (!background && !silent) outputUpdate({ update }, json);
  return 0;
}

function applyUpdate({
  json,
  background,
  backgroundWorker = false,
  delayMs = 0,
  update = null,
  allowAnySemver = false,
  upgrade = false,
  operation = "update",
}) {
  if (isOfflineEnv()) return outputUpdateResult("offline", "offline mode is enabled", json, background, 0, { operation });
  const config = readUpdateConfig();
  if (config.mode === "off") return outputUpdateResult("disabled", "update mode is off", json, background);
  const cache = update ?? readJson(cachePath()) ?? {};
  if (!cache.available) {
    const message = cache.kind === "none" ? "already current" : "no cached update is available";
    return outputUpdateResult("current", message, json, background, 0, { operation, update: cache });
  }
  if (cache.kind !== "patch" && !allowAnySemver) {
    return outputUpdateResult(
      "notify",
      "minor and major updates require an explicit upgrade",
      json,
      background,
      0,
      { operation, update: cache, nextAction: "Run `pire-browser upgrade` to update to the latest version." }
    );
  }
  const installKind = detectInstallKind();
  if (!["global", "pi"].includes(installKind.kind)) {
    return outputUpdateResult(
      "notify",
      "local project installs are notify-only",
      json,
      background,
      0,
      { operation, update: cache, install: installKind, nextAction: localInstallUpgradeHint(cache.latestVersion) }
    );
  }
  if (hasActiveManagedSession()) {
    return outputUpdateResult(
      "deferred",
      "managed Firefox sessions are active",
      json,
      background,
      0,
      {
        operation,
        update: cache,
        install: installKind,
        nextAction: "Close managed Firefox sessions, then rerun `pire-browser upgrade`.",
      }
    );
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
  const commandText = formatCommand(command);
  const maxAttempts = backgroundWorker ? 3 : 1;
  let lastStatus = 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runInstallCommand(command, background);
    if (result.status === 0) {
      return outputUpdateResult(
        "applied",
        `updated to ${cache.latestVersion}`,
        json,
        background,
        0,
        { operation, update: cache, install: installKind, command: commandText, upgrade }
      );
    }
    lastStatus = result.status ?? 1;
    if (attempt >= maxAttempts || !isLockLikeFailure(result)) break;
    sleep(750 * attempt);
  }
  return outputUpdateResult(
    "failed",
    `update command exited with ${lastStatus}`,
    json,
    background,
    1,
    {
      operation,
      update: cache,
      install: installKind,
      command: commandText,
      nextAction: installFailureHint(installKind, cache.latestVersion),
    }
  );
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

function getUpdateRecommendation({ background }) {
  const currentVersion = packageJson.version;
  if (isOfflineEnv()) {
    return {
      checkedAt: Date.now(),
      available: false,
      kind: "offline",
      currentVersion,
      latestVersion: null,
      offline: true,
    };
  }
  const latest = npmViewLatest(background ? 3_000 : 15_000);
  const checkedAt = Date.now();
  const recommendation = latest
    ? classifyUpdate(currentVersion, latest)
    : { available: false, kind: "unknown", currentVersion, latestVersion: null };
  const update = { checkedAt, ...recommendation };
  writeJson(cachePath(), update);
  return update;
}

export function classifyUpdate(currentVersion, latestVersion) {
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
    console.log(formatUpdatePlain(data));
  }
}

function outputUpdateResult(status, message, json, background, exitCode = 0, details = {}) {
  if (!background) outputUpdate({ status, message, ...details }, json);
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

export function formatUpdatePlain(data) {
  if (data.mode) return `pire-browser update mode set to ${data.mode}.`;
  if (data.update && !data.status) return formatUpdateCheckPlain(data.update);
  if (!data.status) return JSON.stringify(data, null, 2);

  const operation = data.operation === "upgrade" ? "upgrade" : "update";
  const update = data.update ?? {};
  const current = update.currentVersion ?? packageJson.version;
  const latest = update.latestVersion;
  if (data.status === "applied") {
    return latest && current
      ? `pire-browser ${operation === "upgrade" ? "upgraded" : "updated"} ${current} -> ${latest}.`
      : `pire-browser ${operation} applied.`;
  }
  if (data.status === "current") {
    return operation === "upgrade"
      ? `pire-browser ${current} is already current.`
      : `pire-browser update is current. ${current} is installed.`;
  }
  if (data.status === "notify") {
    const next = data.nextAction ? `\nNext: ${data.nextAction}` : "";
    const suffix = latest ? ` Latest is ${latest}; current is ${current}.` : "";
    return `pire-browser ${operation} not applied: ${data.message}.${suffix}${next}`;
  }
  if (data.status === "deferred") {
    const next = data.nextAction ? `\nNext: ${data.nextAction}` : "";
    return `pire-browser ${operation} deferred: ${data.message}.${next}`;
  }
  if (data.status === "offline") {
    return `pire-browser ${operation} skipped: offline mode is enabled. Current version is ${current}.`;
  }
  if (data.status === "unknown") {
    const next = data.nextAction ? `\nNext: ${data.nextAction}` : "";
    return `pire-browser ${operation} could not check the latest version. Current version is ${current}.${next}`;
  }
  if (data.status === "disabled") {
    return `pire-browser update mode is off. Run \`pire-browser update configure --mode patch\` to re-enable checks.`;
  }
  if (data.status === "failed") {
    const next = data.nextAction ? `\nNext: ${data.nextAction}` : "";
    return `pire-browser ${operation} failed: ${data.message}.${next}`;
  }
  return `pire-browser update ${data.status}: ${data.message}`;
}

function formatUpdateCheckPlain(update) {
  const current = update.currentVersion ?? packageJson.version;
  if (update.kind === "offline") return `pire-browser update check skipped: offline mode is enabled. Current version is ${current}.`;
  if (update.kind === "unknown") return `pire-browser update check could not reach the npm registry. Current version is ${current}.`;
  if (!update.available) return `pire-browser ${current} is already current.`;
  return `pire-browser ${update.latestVersion} is available (${update.kind}); current is ${current}.\nRun \`pire-browser upgrade\` to update.`;
}

function localInstallUpgradeHint(latestVersion) {
  const suffix = latestVersion ? `@${latestVersion}` : "@latest";
  return `Run \`npm install pire-browser${suffix} --include=optional\` in the project, or install globally with \`npm install -g pire-browser --include=optional\`.`;
}

function installFailureHint(installKind, latestVersion) {
  if (installKind.kind === "pi") return "Run `pi update npm:pire-browser`, then restart Pi.";
  if (installKind.kind === "global") {
    const suffix = latestVersion ? `@${latestVersion}` : "@latest";
    return `Run \`npm install -g pire-browser${suffix} --include=optional\`.`;
  }
  return localInstallUpgradeHint(latestVersion);
}

function formatCommand(command) {
  return [command[0], ...command[1]].join(" ");
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

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
