#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { rootDir, rootPackageJson } from "./platform.mjs";

const root = rootDir();

export function parsePiInstallSmokeArgs(argv, defaults = {}) {
  const version = defaults.version ?? rootPackageJson(root).version;
  const options = {
    source: `npm:pire-browser@${version}`,
    artifactDir: join(root, "target", "pi-install-smoke"),
    keep: false,
    piCommand: "pi",
    skipPostinstall: true,
    installAttempts: 3,
    retryDelayMs: 5000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") {
      options.source = requiredValue(argv, ++i, arg);
    } else if (arg === "--artifact-dir") {
      options.artifactDir = resolve(requiredValue(argv, ++i, arg));
    } else if (arg === "--pi") {
      options.piCommand = requiredValue(argv, ++i, arg);
    } else if (arg === "--keep") {
      options.keep = true;
    } else if (arg === "--allow-postinstall") {
      options.skipPostinstall = false;
    } else if (arg === "--install-attempts") {
      options.installAttempts = Number.parseInt(requiredValue(argv, ++i, arg), 10);
    } else if (arg === "--retry-delay-ms") {
      options.retryDelayMs = Number.parseInt(requiredValue(argv, ++i, arg), 10);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(options.installAttempts) || options.installAttempts < 1) {
    throw new Error("--install-attempts must be a positive integer");
  }
  if (!Number.isInteger(options.retryDelayMs) || options.retryDelayMs < 0) {
    throw new Error("--retry-delay-ms must be a non-negative integer");
  }
  return options;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function piInstallSmokeEnv(baseEnv, agentDir, options = {}) {
  const env = {
    ...baseEnv,
    PI_CODING_AGENT_DIR: agentDir,
    PIRE_BROWSER_DISABLE_UPDATE_CHECK: "1",
  };
  delete env.PIRE_BROWSER_BINARY;
  delete env.PIRE_BROWSER_EXE;
  if (options.skipPostinstall !== false) env.PIRE_BROWSER_SKIP_POSTINSTALL = "1";
  return env;
}

export function expectedPackageSource(source) {
  return source.replace(/^npm:pire-browser@[\w.-]+$/, "npm:pire-browser");
}

function runStep(name, command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    input: options.input,
    shell: process.platform === "win32" && command === "pi",
    timeout: options.timeoutMs,
    windowsHide: true,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const status = result.status ?? (result.error ? 1 : 0);
  const entry = { name, command, args, status, timedOut: result.signal === "SIGTERM" || result.error?.code === "ETIMEDOUT" };
  writeFileSync(join(options.artifactDir, `${options.index}-${name}.stdout.log`), stdout);
  writeFileSync(join(options.artifactDir, `${options.index}-${name}.stderr.log`), stderr);
  options.summary.steps.push(entry);
  options.index += 1;
  if (result.error) throw new Error(`${name} failed to start: ${result.error.message}`);
  if (status !== 0) {
    throw new Error(`${name} exited with ${status}; see ${options.artifactDir}`);
  }
  return { stdout, stderr, status };
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runInstallStep(command, args, options, attempts, retryDelayMs) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return runStep(`pi-install-attempt-${attempt}`, command, args, options);
    } catch (error) {
      lastError = error;
      if (attempt === attempts) break;
      options.summary.steps.push({
        name: `pi-install-retry-${attempt}`,
        command,
        args,
        status: "retrying",
        delayMs: retryDelayMs,
        reason: error.message,
      });
      sleep(retryDelayMs);
    }
  }
  throw lastError;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function validatePiSettings(settings, source) {
  const packages = Array.isArray(settings?.packages) ? settings.packages : [];
  const expected = expectedPackageSource(source);
  if (!packages.includes(expected) && !packages.includes(source)) {
    throw new Error(`Pi settings did not include ${expected}: ${JSON.stringify(packages)}`);
  }
  return packages;
}

export function validateInstalledPackage(packageJson, expectedVersion) {
  if (packageJson.name !== "pire-browser") {
    throw new Error(`Installed package name was ${packageJson.name}, expected pire-browser`);
  }
  if (expectedVersion && packageJson.version !== expectedVersion) {
    throw new Error(`Installed package version was ${packageJson.version}, expected ${expectedVersion}`);
  }
  if (!packageJson.pi?.extensions?.includes("pi/extensions/pire-browser.ts")) {
    throw new Error("Installed package pi.extensions is missing pi/extensions/pire-browser.ts");
  }
  if (!packageJson.pi?.skills?.includes("skills")) {
    throw new Error("Installed package pi.skills is missing skills");
  }
}

export function expectedVersionFromSource(source) {
  const match = /^npm:pire-browser@([\w.-]+)$/.exec(source);
  return match?.[1] ?? null;
}

function jsonLines(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function samePath(actual, expected) {
  return resolve(actual) === resolve(expected);
}

export function validatePiRpcCommands(stdout, packageRoot) {
  const responses = jsonLines(stdout);
  const response = responses.find((entry) => entry.type === "response" && entry.command === "get_commands");
  if (!response) throw new Error("Pi RPC did not return a get_commands response");
  if (!response.success) throw new Error(`Pi RPC get_commands failed: ${response.error ?? "unknown error"}`);
  const commands = Array.isArray(response.data?.commands) ? response.data.commands : [];
  const skill = commands.find((command) => command.name === "skill:pire-browser" && command.source === "skill");
  if (!skill) throw new Error("Pi RPC did not discover skill:pire-browser from the installed package");
  if (!samePath(skill.sourceInfo?.baseDir ?? "", packageRoot)) {
    throw new Error(`Pi RPC skill source did not point at installed package root: ${skill.sourceInfo?.baseDir}`);
  }
  return {
    commandCount: commands.length,
    skill: {
      name: skill.name,
      source: skill.source,
      path: skill.sourceInfo?.path,
      baseDir: skill.sourceInfo?.baseDir,
      packageSource: skill.sourceInfo?.source,
    },
  };
}

export async function validateInstalledPiExtensionLoad(packageRoot) {
  const { discoverAndLoadExtensions } = await import("@earendil-works/pi-coding-agent");
  const extensionPath = join(packageRoot, "pi", "extensions", "pire-browser.ts");
  const result = await discoverAndLoadExtensions([extensionPath], packageRoot);
  if (result.errors.length > 0) {
    throw new Error(`Pi extension loader failed: ${result.errors.map((error) => error.error).join("; ")}`);
  }
  const extension = result.extensions[0];
  if (!extension) throw new Error("Pi extension loader did not return an extension");
  const tools = [...extension.tools.keys()];
  if (!tools.includes("pire-browser") && !tools.includes("pire_browser")) {
    throw new Error(`Pi extension did not register the pire-browser tool; tools: ${tools.join(", ") || "(none)"}`);
  }
  return {
    extensionPath,
    tools,
    commands: [...extension.commands.keys()],
    flags: [...extension.flags.keys()],
  };
}

export async function runPiInstallSmoke(options) {
  const workRoot = mkdtempSync(join(tmpdir(), "pire-pi-install-smoke-"));
  const agentDir = join(workRoot, "agent");
  const artifactDir = resolve(options.artifactDir);
  mkdirSync(agentDir, { recursive: true });
  mkdirSync(artifactDir, { recursive: true });

  const summary = {
    success: false,
    source: options.source,
    expectedSource: expectedPackageSource(options.source),
    workRoot,
    agentDir,
    artifactDir,
    skipPostinstall: options.skipPostinstall !== false,
    steps: [],
  };
  const stepOptions = {
    cwd: workRoot,
    env: piInstallSmokeEnv(process.env, agentDir, options),
    artifactDir,
    summary,
    index: 1,
  };

  try {
    runStep("pi-list-before", options.piCommand, ["list"], stepOptions);
    runInstallStep(
      options.piCommand,
      ["install", options.source],
      stepOptions,
      options.installAttempts,
      options.retryDelayMs
    );
    const listAfter = runStep("pi-list-after", options.piCommand, ["list"], stepOptions);
    if (!listAfter.stdout.includes("npm:pire-browser")) {
      throw new Error("pi list did not show npm:pire-browser after install");
    }

    const settingsPath = join(agentDir, "settings.json");
    if (!existsSync(settingsPath)) throw new Error(`Pi settings were not written: ${settingsPath}`);
    const settings = readJson(settingsPath);
    summary.settingsPath = settingsPath;
    summary.packages = validatePiSettings(settings, options.source);

    const packageRoot = join(agentDir, "npm", "node_modules", "pire-browser");
    const packageJsonPath = join(packageRoot, "package.json");
    if (!existsSync(packageJsonPath)) throw new Error(`Installed package.json not found: ${packageJsonPath}`);
    const packageJson = readJson(packageJsonPath);
    validateInstalledPackage(packageJson, expectedVersionFromSource(options.source));
    summary.packageRoot = packageRoot;
    summary.installedVersion = packageJson.version;

    const nodeArgs = [join(packageRoot, "bin", "pire-browser.js")];
    const version = runStep("pire-browser-version", process.execPath, [...nodeArgs, "--version"], stepOptions);
    if (!version.stdout.includes(`pire-browser ${packageJson.version}`)) {
      throw new Error("installed pire-browser --version did not report the installed package version");
    }
    const skill = runStep("pire-browser-skill", process.execPath, [...nodeArgs, "skills", "get", "core"], stepOptions);
    if (!skill.stdout.includes("## MCP Quick Start") || !skill.stdout.includes("For a direct npm install")) {
      throw new Error("installed core skill did not include first-use/MCP guidance");
    }

    const rpc = runStep("pi-rpc-get-commands", options.piCommand, ["--mode", "rpc", "--no-builtin-tools", "--tools", "pire-browser", "--no-session"], {
      ...stepOptions,
      input: `${JSON.stringify({ type: "get_commands", id: "pire-runtime-smoke-commands" })}\n`,
      timeoutMs: 15_000,
    });
    summary.piRpc = validatePiRpcCommands(rpc.stdout, packageRoot);
    summary.piExtension = await validateInstalledPiExtensionLoad(packageRoot);

    summary.success = true;
    return summary;
  } finally {
    writeFileSync(join(artifactDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    if (!options.keep) rmSync(workRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = await runPiInstallSmoke(parsePiInstallSmokeArgs(process.argv.slice(2)));
    console.log(`Pi install smoke passed for ${summary.source} (${summary.installedVersion}).`);
    console.log(`Pi runtime discovered ${summary.piRpc.skill.name} and registered tool(s): ${summary.piExtension.tools.join(", ")}.`);
    console.log(`Artifacts: ${summary.artifactDir}`);
  } catch (error) {
    console.error(error?.stack || error?.message || String(error));
    process.exit(1);
  }
}
