#!/usr/bin/env node
import { createServer } from "node:net";
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPlatform } from "./build-platform.mjs";
import { stagePlatformPackage } from "./package-platform.mjs";
import {
  PLATFORM_PACKAGES,
  packageNameForTuple,
  platformTuple,
  rootDir,
  rootPackageJson,
  tarballNameForPackage,
} from "./platform.mjs";

const root = rootDir();

export function parseSmokePackedPackageArgs(argv, defaults = {}) {
  const platform = defaults.platform ?? process.platform;
  const arch = defaults.arch ?? process.arch;
  const options = {
    browser: true,
    signedXpi: false,
    buildPlatform: false,
    skipExtensionBuild: false,
    tuple: null,
    packDir: join(root, "target", "packed-package-smoke", "npm"),
    artifactDir: join(root, "target", "release-smoke-artifacts"),
    workDir: null,
    rootTarball: null,
    platformTarball: null,
    firefoxPath: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-browser") {
      options.browser = false;
    } else if (arg === "--browser") {
      options.browser = true;
    } else if (arg === "--signed-xpi") {
      options.signedXpi = true;
    } else if (arg === "--build-platform") {
      options.buildPlatform = true;
    } else if (arg === "--skip-extension-build") {
      options.skipExtensionBuild = true;
    } else if (arg === "--tuple") {
      options.tuple = requiredValue(argv, ++i, arg);
    } else if (arg === "--pack-dir") {
      options.packDir = resolve(requiredValue(argv, ++i, arg));
    } else if (arg === "--artifact-dir") {
      options.artifactDir = resolve(requiredValue(argv, ++i, arg));
    } else if (arg === "--work-dir") {
      options.workDir = resolve(requiredValue(argv, ++i, arg));
    } else if (arg === "--root-tarball") {
      options.rootTarball = resolve(requiredValue(argv, ++i, arg));
    } else if (arg === "--platform-tarball") {
      options.platformTarball = resolve(requiredValue(argv, ++i, arg));
    } else if (arg === "--firefox-path") {
      options.firefoxPath = resolve(requiredValue(argv, ++i, arg));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.packDir = resolve(options.packDir);
  options.artifactDir = resolve(options.artifactDir);
  if (!options.tuple) options.tuple = platformTuple(platform, arch);
  packageNameForTuple(options.tuple);
  return options;
}

export function installTarballArgs({ prefix, rootTarball, platformTarball }) {
  return [
    "install",
    "-g",
    "--prefix",
    prefix,
    rootTarball,
    platformTarball,
    "--omit=dev",
    "--legacy-peer-deps",
    "--package-lock=false",
    "--no-audit",
    "--no-fund",
  ];
}

export function installedBinPath(prefix, platform = process.platform) {
  return platform === "win32"
    ? join(prefix, "pire-browser.cmd")
    : join(prefix, "bin", "pire-browser");
}

export function installedPackageRoot(prefix, packageName = "pire-browser", platform = process.platform) {
  const candidates = platform === "win32"
    ? [join(prefix, "node_modules", packageName), join(prefix, "lib", "node_modules", packageName)]
    : [join(prefix, "lib", "node_modules", packageName), join(prefix, "node_modules", packageName)];
  const found = candidates.find((candidate) => existsSync(join(candidate, "package.json")));
  if (!found) {
    throw new Error(`Could not find installed ${packageName} package under ${prefix}`);
  }
  return found;
}

export function sanitizedSmokeEnv(baseEnv = process.env, dirs = {}, platform = process.platform) {
  const env = { ...baseEnv };
  delete env.PIRE_BROWSER_BINARY;
  delete env.PIRE_BROWSER_EXE;
  env.PIRE_BROWSER_DISABLE_UPDATE_CHECK = "1";
  env.PI_OFFLINE = "1";
  if (dirs.localAppData) env.LOCALAPPDATA = dirs.localAppData;
  if (platform !== "darwin" && dirs.home) env.HOME = dirs.home;
  if (platform !== "darwin" && dirs.xdgDataHome) env.XDG_DATA_HOME = dirs.xdgDataHome;
  if (dirs.firefoxPath) env.PIRE_BROWSER_FIREFOX_PATH = dirs.firefoxPath;
  return env;
}

export function assertOutsideRepo(path, repoRoot = root) {
  const resolvedPath = resolve(path);
  const resolvedRoot = resolve(repoRoot);
  const rel = relative(resolvedRoot, resolvedPath);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    throw new Error(`Packed-package smoke work directory must be outside the repository: ${resolvedPath}`);
  }
}

export function requireSignedXpiSecrets(env = process.env) {
  if (!env.WEB_EXT_API_KEY || !env.WEB_EXT_API_SECRET) {
    throw new Error("Signed-XPI smoke requires WEB_EXT_API_KEY and WEB_EXT_API_SECRET");
  }
}

export function installedPireCommand({ prefix, platform = process.platform }) {
  if (platform === "win32") {
    const launcher = join(prefix, "node_modules", "pire-browser", "bin", "pire-browser.js");
    return {
      command: process.execPath,
      argsPrefix: [launcher],
      shell: false,
      displayCommand: launcher,
    };
  }
  return {
    command: installedBinPath(prefix, platform),
    argsPrefix: [],
    shell: platform === "win32",
    displayCommand: installedBinPath(prefix, platform),
  };
}

export function redactionValues(env = process.env) {
  return ["WEB_EXT_API_KEY", "WEB_EXT_API_SECRET"]
    .map((name) => env[name])
    .filter((value) => typeof value === "string" && value.length > 0);
}

export function redactText(value, env = process.env) {
  let text = value == null ? "" : String(value);
  for (const secret of redactionValues(env)) {
    text = text.split(secret).join("[REDACTED]");
  }
  return text;
}

export function writeStepLogs({ artifactDir, index, label, result, env = process.env }) {
  mkdirSync(artifactDir, { recursive: true });
  const stem = `${String(index).padStart(2, "0")}-${slugify(label)}`;
  const stdoutPath = join(artifactDir, `${stem}.stdout.log`);
  const stderrPath = join(artifactDir, `${stem}.stderr.log`);
  writeFileSync(stdoutPath, redactText(result.stdout ?? "", env));
  writeFileSync(stderrPath, redactText(result.stderr ?? "", env));
  return { stdoutPath, stderrPath, stem };
}

export function smokeDataRoot(env = process.env, platform = process.platform) {
  if (platform === "win32") {
    return join(env.LOCALAPPDATA ?? join(env.USERPROFILE ?? root, "AppData", "Local"), "pire-browser");
  }
  if (platform === "darwin") {
    return join(env.HOME ?? root, "Library", "Application Support", "pire-browser");
  }
  const xdgDataHome = env.XDG_DATA_HOME && env.XDG_DATA_HOME.trim()
    ? env.XDG_DATA_HOME
    : join(env.HOME ?? root, ".local", "share");
  return join(xdgDataHome, "pire-browser");
}

export function fixturePythonCommand(env = process.env, platform = process.platform) {
  return env.PYTHON || (platform === "win32" ? "python" : "python3");
}

export function fixtureServerCommand({ port, fixtureDir, python = fixturePythonCommand() }) {
  return {
    command: python,
    args: ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", fixtureDir],
  };
}

export function windowsCleanupScript(needles) {
  const needleArray = needles.filter(Boolean).map((needle) => `'${escapePowerShellSingleQuoted(needle)}'`).join(", ");
  return `
$needles = @(${needleArray})
$names = @('firefox.exe', 'pire-browser-host.exe')
Get-CimInstance Win32_Process | Where-Object {
  $cmd = $_.CommandLine
  $cmd -and ($names -contains $_.Name) -and ($needles | Where-Object { $cmd.Contains($_) } | Select-Object -First 1)
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}
`;
}

export function unixCleanupTargets(psOutput, needles, currentPid = process.pid) {
  const cleanNeedles = needles.filter(Boolean);
  const targets = [];
  for (const line of String(psOutput ?? "").split(/\r?\n/)) {
    const match = /^\s*(\d+)\s+(.*)$/.exec(line);
    if (!match) continue;
    const pid = Number(match[1]);
    const commandLine = match[2];
    if (!Number.isInteger(pid) || pid <= 0 || pid === currentPid) continue;
    if (!isUnixSmokeProcess(commandLine)) continue;
    if (!cleanNeedles.some((needle) => commandLine.includes(needle))) continue;
    targets.push(pid);
  }
  return targets;
}

export function packedMcpSmokeInput() {
  return [
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}',
    '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"pire_browser_network_route","arguments":{"pattern":"**/api/**"}}}',
    '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"pire_browser_tools_profiles","arguments":{}}}',
  ].join("\n") + "\n";
}

function parseMcpJsonLines(stdout, label) {
  const responses = String(stdout ?? "")
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${label} response line ${index + 1} was not JSON: ${error.message}`);
      }
    });
  return responses;
}

export function validatePackedMcpSmokeOutput(stdout) {
  const responses = parseMcpJsonLines(stdout, "MCP smoke");
  if (responses.length < 3) {
    throw new Error(`MCP smoke expected at least 3 JSON-RPC responses, got ${responses.length}`);
  }

  const byId = new Map(responses.map((response) => [String(response.id), response]));
  const initialized = byId.get("1");
  if (initialized?.result?.serverInfo?.name !== "pire-browser") {
    throw new Error("MCP smoke initialize response did not identify the pire-browser server");
  }

  const missingToolMessage = String(byId.get("2")?.result?.content?.[0]?.text ?? "");
  if (!missingToolMessage.includes("pire_browser_network_route") || !missingToolMessage.includes("--tools core,network")) {
    throw new Error("MCP smoke did not return the expected profile-mismatch guidance for network_route");
  }

  const profiles = byId.get("3")?.result?.structuredContent?.profiles;
  if (!Array.isArray(profiles)) {
    throw new Error("MCP smoke tools_profiles response did not include structured profiles");
  }
  const profile = (name) => profiles.find((candidate) => candidate.name === name);
  const core = profile("core");
  const network = profile("network");
  const all = profile("all");
  if (core?.active !== true || network?.active !== false || all?.active !== false) {
    throw new Error("MCP smoke profile active flags were not correct for --tools core");
  }

  return {
    responses: responses.length,
    serverVersion: initialized.result.serverInfo.version ?? null,
    missingToolMessage,
    coreActive: core.active,
    networkActive: network.active,
    allActive: all.active,
  };
}

export function packedMcpBrowserSmokeInput({ profile, url, screenshot, executablePath = null }) {
  const target = (extra = {}) => ({
    profile,
    ...extra,
  });
  const openArgs = target({ url });
  if (executablePath) openArgs.executablePath = executablePath;
  return [
    { id: 1, method: "initialize", params: {} },
    { id: 2, method: "tools/call", params: { name: "pire_browser_open", arguments: openArgs } },
    { id: 3, method: "tools/call", params: { name: "pire_browser_snapshot", arguments: target({ interactive: true, compact: true }) } },
    { id: 4, method: "tools/call", params: { name: "pire_browser_find", arguments: target({ kind: "label", query: "Email", action: "fill", value: "mcp-smoke@example.com" }) } },
    { id: 5, method: "tools/call", params: { name: "pire_browser_find", arguments: target({ kind: "role", query: "button", name: "Submit", action: "click" }) } },
    { id: 6, method: "tools/call", params: { name: "pire_browser_wait_for_selector", arguments: target({ selector: "#done:not([hidden])", waitTimeoutMs: 30_000 }) } },
    { id: 7, method: "tools/call", params: { name: "pire_browser_get_text", arguments: target({ selector: "#done" }) } },
    { id: 8, method: "tools/call", params: { name: "pire_browser_get_value", arguments: target({ selector: "#email" }) } },
    { id: 9, method: "tools/call", params: { name: "pire_browser_get_url", arguments: target() } },
    { id: 10, method: "tools/call", params: { name: "pire_browser_get_title", arguments: target() } },
    { id: 11, method: "tools/call", params: { name: "pire_browser_is_visible", arguments: target({ selector: "#done" }) } },
    { id: 12, method: "tools/call", params: { name: "pire_browser_screenshot", arguments: target({ path: screenshot }) } },
    { id: 13, method: "tools/call", params: { name: "pire_browser_tab_list", arguments: target() } },
    { id: 14, method: "tools/call", params: { name: "pire_browser_close", arguments: target() } },
  ].map((message) => JSON.stringify({ jsonrpc: "2.0", ...message })).join("\n") + "\n";
}

export function validatePackedMcpBrowserSmokeOutput(stdout) {
  const responses = parseMcpJsonLines(stdout, "MCP browser smoke");
  const byId = new Map(responses.map((response) => [String(response.id), response]));
  const initialized = byId.get("1");
  if (initialized?.result?.serverInfo?.name !== "pire-browser") {
    throw new Error("MCP browser smoke initialize response did not identify the pire-browser server");
  }
  for (const id of ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"]) {
    const response = byId.get(id);
    if (!response) throw new Error(`MCP browser smoke missing response id ${id}`);
    if (response.error) {
      throw new Error(`MCP browser smoke tool id ${id} returned JSON-RPC error: ${response.error.message ?? JSON.stringify(response.error)}`);
    }
    if (response.result?.isError === true) {
      throw new Error(`MCP browser smoke tool id ${id} returned isError=true: ${response.result.content?.[0]?.text ?? ""}`);
    }
  }
  const snapshotText = String(byId.get("3")?.result?.content?.[0]?.text ?? "");
  if (!snapshotText.includes("@e")) {
    throw new Error("MCP browser smoke snapshot did not include semantic refs");
  }
  const expectedText = [
    ["7", "Submitted", "get_text did not verify submitted marker"],
    ["8", "mcp-smoke@example.com", "get_value did not verify filled email"],
    ["9", "/form.html", "get_url did not verify fixture URL"],
    ["10", "pire-browser fixture", "get_title did not verify fixture title"],
    ["11", "true", "is_visible did not verify submitted marker visibility"],
  ];
  for (const [id, expected, message] of expectedText) {
    const text = String(byId.get(id)?.result?.content?.[0]?.text ?? "");
    if (!text.includes(expected)) throw new Error(`MCP browser smoke ${message}`);
  }
  return {
    responses: responses.length,
    serverVersion: initialized.result.serverInfo.version ?? null,
  };
}

export function isSuccessfulLaunchTimeout(result) {
  const errorText = `${result?.error?.code ?? ""} ${result?.error?.message ?? ""}`;
  if (!/\bETIMEDOUT\b/.test(errorText)) return false;
  const stdout = result?.stdout ?? "";
  return /pire-browser (launched|reused) Firefox profile/.test(stdout) && /\bSession:\s+\S+/.test(stdout);
}

class SmokeRecorder {
  constructor({ artifactDir, env }) {
    this.artifactDir = artifactDir;
    this.env = env;
    this.steps = [];
    this.index = 0;
    mkdirSync(artifactDir, { recursive: true });
  }

  record(label, result) {
    this.index += 1;
    const logs = writeStepLogs({
      artifactDir: this.artifactDir,
      index: this.index,
      label,
      result,
      env: this.env,
    });
    const step = {
      index: this.index,
      label,
      status: result.status ?? null,
      signal: result.signal ?? null,
      error: result.error ? result.error.message : null,
      stdout: relative(this.artifactDir, logs.stdoutPath),
      stderr: relative(this.artifactDir, logs.stderrPath),
    };
    this.steps.push(step);
    return step;
  }
}

async function main(argv) {
  let summary = null;
  let recorder = null;
  let localAppData = null;
  let dataRoot = null;
  let prefix = null;
  let workRoot = null;
  let command = null;
  const profiles = [];
  try {
    const options = parseSmokePackedPackageArgs(argv);
    if (options.signedXpi) requireSignedXpiSecrets();

    workRoot = options.workDir ?? mkdtempSync(join(tmpdir(), "pire-browser-packed-smoke-"));
    assertOutsideRepo(workRoot);
    const commandCwd = join(workRoot, "cwd");
    prefix = join(workRoot, "prefix");
    localAppData = join(workRoot, "local-app-data");
    const home = join(workRoot, "home");
    const xdgDataHome = join(workRoot, "xdg-data");
    const artifactDir = options.artifactDir;
    for (const dir of [commandCwd, prefix, localAppData, home, xdgDataHome, options.packDir, artifactDir]) {
      mkdirSync(dir, { recursive: true });
    }

    const smokePlatform = options.tuple.split("-")[0];
    const env = sanitizedSmokeEnv(process.env, {
      localAppData,
      home,
      xdgDataHome,
      firefoxPath: options.firefoxPath,
    }, smokePlatform);
    dataRoot = smokeDataRoot(env, smokePlatform);
    recorder = new SmokeRecorder({ artifactDir, env });
    summary = {
      success: false,
      startedAt: new Date().toISOString(),
      artifactDir,
      workRoot,
      commandCwd,
      prefix,
      localAppData,
      dataRoot,
      tuple: options.tuple,
      browser: options.browser,
      signedXpi: options.signedXpi,
      firefoxPath: options.firefoxPath ?? null,
      rootTarball: null,
      platformTarball: null,
      installedPackageRoot: null,
      nativeResolution: null,
      mcp: null,
      mcpBrowser: null,
      profiles,
      modes: [],
      steps: recorder.steps,
      error: null,
    };
    writeSummary(summary, artifactDir, env);
    console.log(`Release smoke artifacts: ${artifactDir}`);

    const artifacts = prepareArtifacts(options, recorder, env);
    summary.rootTarball = artifacts.rootTarball;
    summary.platformTarball = artifacts.platformTarball;
    writeSummary(summary, artifactDir, env);

    installPackedTarballs({
      prefix,
      cwd: commandCwd,
      env,
      rootTarball: artifacts.rootTarball,
      platformTarball: artifacts.platformTarball,
      recorder,
    });

    const packageRoot = installedPackageRoot(prefix);
    summary.installedPackageRoot = packageRoot;
    const resolved = await assertInstalledNativeResolution({ packageRoot, commandCwd, env });
    summary.nativeResolution = resolved;
    writeSummary(summary, artifactDir, env);
    console.log(`Installed native package resolved from ${resolved.source}: ${resolved.path}`);

    command = installedPireCommand({ prefix, platform: smokePlatform });
    if (!existsSync(command.displayCommand ?? command.command)) {
      throw new Error(`Installed pire-browser command not found: ${command.displayCommand ?? command.command}`);
    }

    runInstalledChecks({ command, commandCwd, env, recorder, firefoxPath: options.firefoxPath });
    runPackedMcpSmoke({ command, commandCwd, env, recorder, summary });
    if (options.browser) {
      await runBrowserSmoke({
        command,
        commandCwd,
        env,
        workRoot,
        artifactDir,
        dataRoot,
        prefix,
        firefoxPath: options.firefoxPath,
        mode: "web-ext",
        recorder,
        summary,
      });
      await runMcpBrowserSmoke({
        command,
        commandCwd,
        env,
        workRoot,
        artifactDir,
        dataRoot,
        prefix,
        firefoxPath: options.firefoxPath,
        recorder,
        summary,
      });
      if (options.signedXpi) {
        await runBrowserSmoke({
          command,
          commandCwd,
          env: { ...env, PIRE_BROWSER_EXTENSION_MODE: "xpi" },
          workRoot,
          artifactDir,
          dataRoot,
          prefix,
          firefoxPath: options.firefoxPath,
          mode: "xpi",
          recorder,
          summary,
        });
      }
    }

    summary.success = true;
    summary.finishedAt = new Date().toISOString();
    writeSummary(summary, artifactDir, env);
    console.log(`Packed-package smoke passed: ${workRoot}`);
    console.log(`Release smoke artifacts: ${artifactDir}`);
    return 0;
  } catch (error) {
    if (summary) {
      summary.error = error.message;
      summary.finishedAt = new Date().toISOString();
      writeSummary(summary, summary.artifactDir, recorder?.env ?? process.env);
      if (dataRoot) copyDiagnostics({ dataRoot, artifactDir: summary.artifactDir });
      if (process.platform === "win32" && workRoot && prefix) {
        cleanupWindowsProcesses({
          workRoot,
          prefix,
          profilePaths: summary.profiles.map((profile) => profile.profilePath),
          recorder,
          env: recorder?.env ?? process.env,
        });
      } else if (workRoot && prefix) {
        cleanupUnixProcesses({
          workRoot,
          prefix,
          profilePaths: summary.profiles.map((profile) => profile.profilePath),
          recorder,
          env: recorder?.env ?? process.env,
        });
      }
    }
    console.error(error.message);
    return 1;
  }
}

function prepareArtifacts(options, recorder, env) {
  mkdirSync(options.packDir, { recursive: true });
  if (options.signedXpi && !options.rootTarball) {
    runChecked("Sign extension XPI", process.execPath, [join(root, "scripts", "package-extension-xpi.mjs"), "--sign"], {
      cwd: root,
      env: process.env,
      recorder,
    });
  } else if (!options.rootTarball && !options.skipExtensionBuild) {
    runChecked("Build Firefox extension", npmCommand(), ["--prefix", "extension", "run", "build"], {
      cwd: root,
      env: process.env,
      shell: process.platform === "win32",
      recorder,
    });
  }

  if (options.buildPlatform && !options.platformTarball) {
    buildPlatform(options.tuple);
  }

  const rootTarball = options.rootTarball ?? packRoot(options.packDir, recorder, env);
  const platformTarball = options.platformTarball ?? packPlatform(options.tuple, options.packDir);
  for (const path of [rootTarball, platformTarball]) {
    if (!existsSync(path)) throw new Error(`Missing expected tarball: ${path}`);
  }
  return { rootTarball, platformTarball };
}

function packRoot(packDir, recorder, env) {
  const result = runChecked("Pack root package", npmCommand(), ["pack", "--pack-destination", packDir, "--json"], {
    cwd: root,
    env,
    shell: process.platform === "win32",
    recorder,
  });
  const [packed] = JSON.parse(result.stdout);
  return join(packDir, packed.filename);
}

function packPlatform(tuple, packDir) {
  stagePlatformPackage(tuple, { pack: true, packDestination: packDir });
  const packageName = PLATFORM_PACKAGES[tuple];
  const version = rootPackageJson(root).version;
  return join(packDir, tarballNameForPackage(packageName, version));
}

function installPackedTarballs({ prefix, cwd, env, rootTarball, platformTarball, recorder }) {
  runChecked("Install packed root and platform tarballs", npmCommand(), installTarballArgs({
    prefix,
    rootTarball,
    platformTarball,
  }), {
    cwd,
    env,
    shell: process.platform === "win32",
    recorder,
  });
}

async function assertInstalledNativeResolution({ packageRoot, commandCwd, env }) {
  const moduleUrl = pathToFileURL(join(packageRoot, "scripts", "platform.mjs")).href;
  const platform = await import(moduleUrl);
  const resolved = platform.resolveNativeBinary({
    root: packageRoot,
    cwd: commandCwd,
    env,
  });
  if (!resolved.ok) throw new Error(resolved.reason);
  if (resolved.source === "development" || resolved.source === "env") {
    throw new Error(`Packed smoke resolved an unsafe native source: ${resolved.source} (${resolved.path})`);
  }
  if (isInside(resolved.path, root)) {
    throw new Error(`Packed smoke resolved a repository binary instead of the installed package: ${resolved.path}`);
  }
  return resolved;
}

export function installCommandArgs({ firefoxPath = null } = {}) {
  const args = ["install"];
  if (firefoxPath) args.push("--firefox-path", firefoxPath);
  return args;
}

function runInstalledChecks({ command, commandCwd, env, recorder, firefoxPath = null }) {
  const skill = runPire(command, ["skills", "cat", "core", "--json"], { cwd: commandCwd, env, recorder });
  const parsed = JSON.parse(skill.stdout);
  if (parsed.success !== true || parsed.data?.skill?.name !== "core") {
    throw new Error("skills cat core --json did not return the expected success/data envelope");
  }
  const skillGet = runPire(command, ["skills", "get", "core", "--json"], { cwd: commandCwd, env, recorder });
  const parsedGet = JSON.parse(skillGet.stdout);
  if (
    parsedGet.success !== true ||
    parsedGet.data?.skill?.name !== "core" ||
    !String(parsedGet.data?.skill?.content ?? "").includes("pire-browser skills get --all")
  ) {
    throw new Error("skills get core --json did not return the expected current success/data envelope");
  }
  runPire(command, installCommandArgs({ firefoxPath }), { cwd: commandCwd, env, recorder });
  const installStatus = runPire(command, ["install-status", "--json"], { cwd: commandCwd, env, recorder });
  const parsedInstallStatus = JSON.parse(installStatus.stdout);
  if (parsedInstallStatus.success !== true || parsedInstallStatus.data?.ok !== true) {
    throw new Error("install-status --json did not report a healthy installed package after public install");
  }
  runPire(command, ["status", "--json"], { cwd: commandCwd, env, recorder });
  runPire(command, ["doctor"], { cwd: commandCwd, env, recorder });
}

function runPackedMcpSmoke({ command, commandCwd, env, recorder, summary }) {
  const result = runPire(command, ["mcp", "--tools", "core"], {
    cwd: commandCwd,
    env,
    recorder,
    input: packedMcpSmokeInput(),
  });
  const mcp = validatePackedMcpSmokeOutput(result.stdout);
  summary.mcp = {
    success: true,
    ...mcp,
  };
  writeSummary(summary, summary.artifactDir, env);
}

async function runMcpBrowserSmoke({
  command,
  commandCwd,
  env,
  workRoot,
  artifactDir,
  dataRoot,
  prefix,
  firefoxPath,
  recorder,
  summary,
}) {
  if (firefoxPath && !existsSync(firefoxPath)) {
    throw new Error(`Firefox not found at ${firefoxPath}`);
  }
  const mode = "mcp-web-ext";
  const fixture = await startFixtureServer({ artifactDir });
  const profile = `packed-${mode}-${Date.now()}`;
  const profilePath = join(dataRoot, "firefox-profiles", profile);
  const screenshotDir = join(artifactDir, "screenshots");
  mkdirSync(screenshotDir, { recursive: true });
  const screenshot = join(screenshotDir, `screenshot-${mode}.png`);
  const modeResult = {
    mode,
    mcp: true,
    profile,
    profilePath,
    fixtureUrl: fixture.url,
    screenshot,
    success: false,
  };
  summary.profiles.push({ mode, profile, profilePath });
  summary.modes.push(modeResult);
  summary.mcpBrowser = modeResult;
  writeSummary(summary, artifactDir, env);

  try {
    runPire(command, installCommandArgs({ firefoxPath }), { cwd: commandCwd, env, recorder });
    runPire(command, ["doctor", "--json"], { cwd: commandCwd, env, recorder });
    warmWebExtCache({ cwd: commandCwd, env, recorder });

    const result = runPire(command, ["mcp", "--tools", "core"], {
      cwd: commandCwd,
      env,
      timeoutMs: 300_000,
      recorder,
      input: packedMcpBrowserSmokeInput({
        profile,
        url: fixture.url,
        screenshot,
        executablePath: firefoxPath,
      }),
    });
    modeResult.validation = validatePackedMcpBrowserSmokeOutput(result.stdout);
    if (!existsSync(screenshot)) throw new Error(`Expected MCP screenshot was not created: ${screenshot}`);
    modeResult.success = true;
  } finally {
    runPire(command, ["--profile", profile, "close"], { cwd: commandCwd, env, allowFailure: true, recorder });
    await fixture.close();
    copyDiagnostics({ dataRoot, artifactDir });
    if (process.platform === "win32") {
      cleanupWindowsProcesses({ workRoot, prefix, profilePaths: [profilePath], recorder, env });
    } else {
      cleanupUnixProcesses({ workRoot, prefix, profilePaths: [profilePath], recorder, env });
    }
    writeSummary(summary, artifactDir, env);
  }
}

async function runBrowserSmoke({
  command,
  commandCwd,
  env,
  workRoot,
  artifactDir,
  dataRoot,
  prefix,
  firefoxPath,
  mode,
  recorder,
  summary,
}) {
  if (firefoxPath && !existsSync(firefoxPath)) {
    throw new Error(`Firefox not found at ${firefoxPath}`);
  }
  const fixture = await startFixtureServer({ artifactDir });
  const profile = `packed-${mode}-${Date.now()}`;
  const profilePath = join(dataRoot, "firefox-profiles", profile);
  const screenshotDir = join(artifactDir, "screenshots");
  mkdirSync(screenshotDir, { recursive: true });
  const screenshot = join(screenshotDir, `screenshot-${mode}.png`);
  const modeResult = {
    mode,
    profile,
    profilePath,
    fixtureUrl: fixture.url,
    screenshot,
    success: false,
  };
  summary.profiles.push({ mode, profile, profilePath });
  summary.modes.push(modeResult);
  writeSummary(summary, artifactDir, env);

  try {
    runPire(command, installCommandArgs({ firefoxPath }), { cwd: commandCwd, env, recorder });
    runPire(command, ["doctor", "--json"], { cwd: commandCwd, env, recorder });
    if (mode === "web-ext") {
      warmWebExtCache({ cwd: commandCwd, env, recorder });
    }

    const launchArgs = ["launch", "--profile", profile, "--url", fixture.url];
    if (firefoxPath) launchArgs.push("--firefox-path", firefoxPath);
    runPire(command, launchArgs, {
      cwd: commandCwd,
      env,
      timeoutMs: 300_000,
      recorder,
      acceptErrorResult: isSuccessfulLaunchTimeout,
    });

    const prefixArgs = ["--session-name", profile];
    const snapshot = runPire(command, [...prefixArgs, "snapshot", "-i"], { cwd: commandCwd, env, recorder });
    if (!snapshot.stdout.includes("@e")) throw new Error("snapshot -i did not include semantic refs");
    runPire(command, [...prefixArgs, "find", "label", "Email", "fill", "packed-smoke@example.com"], { cwd: commandCwd, env, recorder });
    runPire(command, [...prefixArgs, "find", "role", "button", "--name", "Submit", "click"], { cwd: commandCwd, env, recorder });
    runPire(command, [...prefixArgs, "wait", "--selector", "#done:not([hidden])"], { cwd: commandCwd, env, recorder });
    runPire(command, [...prefixArgs, "screenshot", screenshot], { cwd: commandCwd, env, recorder });
    runPire(command, [...prefixArgs, "tabs", "list"], { cwd: commandCwd, env, recorder });
    if (!existsSync(screenshot)) throw new Error(`Expected screenshot was not created: ${screenshot}`);
    modeResult.success = true;
  } finally {
    runPire(command, ["--session-name", profile, "close"], { cwd: commandCwd, env, allowFailure: true, recorder });
    await fixture.close();
    copyDiagnostics({ dataRoot, artifactDir });
    if (process.platform === "win32") {
      cleanupWindowsProcesses({ workRoot, prefix, profilePaths: [profilePath], recorder, env });
    } else {
      cleanupUnixProcesses({ workRoot, prefix, profilePaths: [profilePath], recorder, env });
    }
    writeSummary(summary, artifactDir, env);
  }
}

function runPire(command, args, options = {}) {
  const commandArgs = [...(command.argsPrefix ?? []), ...args];
  return runChecked(`pire-browser ${args.join(" ")}`, command.command, commandArgs, {
    cwd: options.cwd,
    env: options.env,
    shell: command.shell,
    timeoutMs: options.timeoutMs,
    allowFailure: options.allowFailure,
    acceptErrorResult: options.acceptErrorResult,
    recorder: options.recorder,
    input: options.input,
  });
}

function warmWebExtCache({ cwd, env, recorder }) {
  runChecked("Warm web-ext npx cache", npxCommand(), ["--yes", "web-ext", "--version"], {
    cwd,
    env,
    shell: process.platform === "win32",
    timeoutMs: 180_000,
    recorder,
  });
}

function runChecked(label, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: "utf8",
    shell: options.shell ?? false,
    timeout: options.timeoutMs,
    windowsHide: true,
    input: options.input,
  });
  if (options.recorder) options.recorder.record(label, result);
  if (result.error) {
    if (options.acceptErrorResult?.(result)) return result;
    if (options.allowFailure) return result;
    throw new Error(`${label} failed: ${result.error.message}`);
  }
  if ((result.status ?? 1) !== 0 && !options.allowFailure) {
    throw new Error(`${label} exited with ${result.status ?? 1}\n${redactText(result.stdout ?? "", options.env)}\n${redactText(result.stderr ?? "", options.env)}`);
  }
  return result;
}

async function startFixtureServer({ artifactDir }) {
  const fixtureDir = join(root, "tests", "fixtures");
  const port = await findFreePort();
  const stdoutPath = join(artifactDir, "fixture-server.stdout.log");
  const stderrPath = join(artifactDir, "fixture-server.stderr.log");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");
  const { command, args } = fixtureServerCommand({ port, fixtureDir });
  const child = spawn(command, args, {
    cwd: root,
    stdio: ["ignore", stdoutFd, stderrFd],
    windowsHide: true,
  });
  closeSync(stdoutFd);
  closeSync(stderrFd);
  child.unref();
  const url = `http://127.0.0.1:${port}/form.html`;
  try {
    await waitForHttp(url, child);
  } catch (error) {
    await stopFixtureServer(child);
    throw error;
  }
  return {
    url,
    port,
    pid: child.pid,
    stdoutPath,
    stderrPath,
    close: () => stopFixtureServer(child),
  };
}

function findFreePort() {
  return new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = address.port;
      server.close(() => resolvePromise(port));
    });
  });
}

async function waitForHttp(url, child) {
  const deadline = Date.now() + 10_000;
  let lastError = null;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`fixture server exited before accepting requests with code ${child.exitCode}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`fixture server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
  }
  throw new Error(`timed out waiting for fixture server at ${url}: ${lastError?.message ?? "unknown error"}`);
}

function stopFixtureServer(child) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  if (process.platform === "win32" && child.pid) {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {
      encoding: "utf8",
      windowsHide: true,
    });
  } else {
    child.kill("SIGTERM");
  }
  return new Promise((resolvePromise) => {
    const timer = setTimeout(resolvePromise, 1500);
    child.once("exit", () => {
      clearTimeout(timer);
      resolvePromise();
    });
  });
}

function cleanupWindowsProcesses({ workRoot, prefix, profilePaths = [], recorder, env }) {
  const script = windowsCleanupScript([workRoot, prefix, ...profilePaths]);
  runChecked("Windows smoke process cleanup", "powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    script,
  ], {
    env,
    recorder,
    allowFailure: true,
  });
}

function cleanupUnixProcesses({ workRoot, prefix, profilePaths = [], recorder, env }) {
  const needles = [workRoot, prefix, ...profilePaths];
  const result = spawnSync("ps", ["-eo", "pid,args"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status === 0) {
    for (const pid of unixCleanupTargets(result.stdout, needles)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Best-effort cleanup for smoke-owned browser processes.
      }
    }
  }
  if (recorder) recorder.record("Unix smoke process cleanup", result);
  if (result.status !== 0) {
    // Cleanup must not hide the real smoke failure.
    return;
  }
}

function copyDiagnostics({ dataRoot, artifactDir }) {
  const sourceRoot = dataRoot;
  const destRoot = join(artifactDir, "runtime-data", "pire-browser");
  for (const name of ["sessions", "profiles"]) {
    const source = join(sourceRoot, name);
    if (existsSync(source)) {
      rmSync(join(destRoot, name), { recursive: true, force: true });
      mkdirSync(destRoot, { recursive: true });
      cpSync(source, join(destRoot, name), { recursive: true });
    }
  }
}

function writeSummary(summary, artifactDir, env) {
  mkdirSync(artifactDir, { recursive: true });
  writeFileSync(join(artifactDir, "summary.json"), redactText(JSON.stringify(summary, null, 2), env));
}

function isInside(path, parent) {
  const rel = relative(resolve(parent), resolve(path));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "step";
}

function escapePowerShellSingleQuoted(value) {
  return String(value).replace(/'/g, "''");
}

function isUnixSmokeProcess(commandLine) {
  return /firefox/i.test(commandLine)
    || /\bweb-ext\b/.test(commandLine)
    || (/\bnode\b/.test(commandLine) && /web-ext/.test(commandLine))
    || /\bpire-browser-host\b/.test(commandLine);
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
