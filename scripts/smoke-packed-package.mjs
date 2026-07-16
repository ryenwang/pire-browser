#!/usr/bin/env node
import { createServer } from "node:net";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
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
    lifecycleStressCount: defaults.lifecycleStressCount ?? 0,
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
    } else if (arg === "--lifecycle-stress-count") {
      options.lifecycleStressCount = Number(requiredValue(argv, ++i, arg));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  options.packDir = resolve(options.packDir);
  options.artifactDir = resolve(options.artifactDir);
  if (!options.tuple) options.tuple = platformTuple(platform, arch);
  if (!Number.isInteger(options.lifecycleStressCount) || options.lifecycleStressCount < 0 || options.lifecycleStressCount > 1000) {
    throw new Error("--lifecycle-stress-count must be an integer from 0 to 1000");
  }
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

export function installedWebExtBin(packageRoot, platform = process.platform) {
  return join(packageRoot, "node_modules", ".bin", platform === "win32" ? "web-ext.cmd" : "web-ext");
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
  if (dirs.tempRoot) {
    env.TEMP = dirs.tempRoot;
    env.TMP = dirs.tempRoot;
    env.TMPDIR = dirs.tempRoot;
  }
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

export function packedMcpBrowserSmokeInput({ session, url, screenshot, executablePath = null }) {
  const target = (extra = {}) => ({
    session,
    ...extra,
  });
  const openArgs = target({ url });
  if (executablePath) openArgs.executablePath = executablePath;
  return [
    { id: 1, method: "initialize", params: {} },
    { id: 2, method: "tools/call", params: { name: "pire_browser_open", arguments: openArgs } },
    { id: 3, method: "tools/call", params: { name: "pire_browser_snapshot", arguments: target({ interactive: true, compact: true }) } },
    { id: 4, method: "tools/call", params: { name: "pire_browser_fill", arguments: target({ selector: "#email", text: "mcp-smoke@example.com" }) } },
    { id: 5, method: "tools/call", params: { name: "pire_browser_click", arguments: target({ selector: "[data-testid='submit-button']" }) } },
    { id: 6, method: "tools/call", params: { name: "pire_browser_wait_for_selector", arguments: target({ selector: "#done:not([hidden])", waitTimeoutMs: 30_000 }) } },
    { id: 7, method: "tools/call", params: { name: "pire_browser_get_text", arguments: target({ selector: "#done" }) } },
    { id: 8, method: "tools/call", params: { name: "pire_browser_eval", arguments: target({ script: "document.querySelector('#email').value" }) } },
    { id: 9, method: "tools/call", params: { name: "pire_browser_get_url", arguments: target() } },
    { id: 10, method: "tools/call", params: { name: "pire_browser_get_title", arguments: target() } },
    { id: 11, method: "tools/call", params: { name: "pire_browser_eval", arguments: target({ script: "!document.querySelector('#done').hidden" }) } },
    { id: 12, method: "tools/call", params: { name: "pire_browser_screenshot", arguments: target({ path: screenshot }) } },
    { id: 13, method: "tools/call", params: { name: "pire_browser_tab_list", arguments: target() } },
    { id: 14, method: "tools/call", params: { name: "pire_browser_close", arguments: target() } },
  ].map((message) => JSON.stringify({ jsonrpc: "2.0", ...message })).join("\n") + "\n";
}

export function packedMcpNetworkSmokeInput({ session, url, harPath, executablePath = null }) {
  const target = (extra = {}) => ({
    session,
    ...extra,
  });
  const openArgs = target({ url });
  if (executablePath) openArgs.executablePath = executablePath;
  return [
    { id: 1, method: "initialize", params: {} },
    { id: 2, method: "tools/call", params: { name: "pire_browser_open", arguments: openArgs } },
    { id: 3, method: "tools/call", params: { name: "pire_browser_network_har_start", arguments: target() } },
    { id: 4, method: "tools/call", params: { name: "pire_browser_click", arguments: target({ selector: "button[aria-label='Load API']" }) } },
    {
      id: 5,
      method: "tools/call",
      params: {
        name: "pire_browser_network_wait_for_request",
        arguments: target({
          pattern: "**/api/status.json**",
          resourceType: "xhr,fetch",
          method: "GET",
          waitTimeoutMs: 30_000,
        }),
      },
    },
    {
      id: 6,
      method: "tools/call",
      params: {
        name: "pire_browser_network_wait_for_response",
        arguments: target({
          pattern: "**/api/status.json**",
          resourceType: "xhr,fetch",
          method: "GET",
          status: "2xx",
          waitTimeoutMs: 30_000,
        }),
      },
    },
    {
      id: 7,
      method: "tools/call",
      params: {
        name: "pire_browser_network_requests",
        arguments: target({
          filter: "/api/status.json",
          resourceType: "xhr,fetch",
          method: "GET",
          status: "2xx",
        }),
      },
    },
    { id: 8, method: "tools/call", params: { name: "pire_browser_network_har_stop", arguments: target({ path: harPath }) } },
    { id: 9, method: "tools/call", params: { name: "pire_browser_wait_for_text", arguments: target({ text: "network fixture ready", waitTimeoutMs: 30_000 }) } },
    { id: 10, method: "tools/call", params: { name: "pire_browser_get_text", arguments: target({ selector: "#api-result" }) } },
    { id: 11, method: "tools/call", params: { name: "pire_browser_close", arguments: target() } },
  ].map((message) => JSON.stringify({ jsonrpc: "2.0", ...message })).join("\n") + "\n";
}

export function packedMcpFilesSmokeInput({ session, url, uploadPath, downloadPath, waitDownloadPath, downloadDir, executablePath = null }) {
  const target = (extra = {}) => ({
    session,
    ...extra,
  });
  const openArgs = target({ url, downloadPath: downloadDir });
  if (executablePath) openArgs.executablePath = executablePath;
  return [
    { id: 1, method: "initialize", params: {} },
    { id: 2, method: "tools/call", params: { name: "pire_browser_open", arguments: openArgs } },
    { id: 3, method: "tools/call", params: { name: "pire_browser_upload", arguments: target({ selector: "#upload", files: [uploadPath] }) } },
    { id: 4, method: "tools/call", params: { name: "pire_browser_wait_for_text", arguments: target({ text: "packed MCP upload fixture", waitTimeoutMs: 30_000 }) } },
    { id: 5, method: "tools/call", params: { name: "pire_browser_get_text", arguments: target({ selector: "#upload-summary" }) } },
    { id: 6, method: "tools/call", params: { name: "pire_browser_click", arguments: target({ selector: "#download-link" }) } },
    { id: 7, method: "tools/call", params: { name: "pire_browser_wait_download", arguments: target({ path: waitDownloadPath, timeout: 60_000 }) } },
    { id: 8, method: "tools/call", params: { name: "pire_browser_download", arguments: target({ selector: "#download-link", path: downloadPath, timeout: 60_000 }) } },
    { id: 9, method: "tools/call", params: { name: "pire_browser_close", arguments: target() } },
  ].map((message) => JSON.stringify({ jsonrpc: "2.0", ...message })).join("\n") + "\n";
}

export function packedMcpStateSmokeInput({ session, url, clearUrl, restoreUrl, formUrl, statePath, executablePath = null }) {
  const target = (extra = {}) => ({
    session,
    ...extra,
  });
  const openArgs = target({ url });
  if (executablePath) openArgs.executablePath = executablePath;
  return [
    { id: 1, method: "initialize", params: {} },
    { id: 2, method: "tools/call", params: { name: "pire_browser_open", arguments: openArgs } },
    { id: 3, method: "tools/call", params: { name: "pire_browser_wait_for_text", arguments: target({ text: "mcp-state-smoke", waitTimeoutMs: 30_000 }) } },
    { id: 4, method: "tools/call", params: { name: "pire_browser_state_save", arguments: target({ path: statePath }) } },
    { id: 5, method: "tools/call", params: { name: "pire_browser_open", arguments: target({ url: clearUrl }) } },
    { id: 6, method: "tools/call", params: { name: "pire_browser_wait_for_text", arguments: target({ text: "EMPTY", waitTimeoutMs: 30_000 }) } },
    { id: 7, method: "tools/call", params: { name: "pire_browser_get_text", arguments: target({ selector: "#local" }) } },
    { id: 8, method: "tools/call", params: { name: "pire_browser_get_text", arguments: target({ selector: "#session" }) } },
    { id: 9, method: "tools/call", params: { name: "pire_browser_get_text", arguments: target({ selector: "#cookie" }) } },
    { id: 10, method: "tools/call", params: { name: "pire_browser_open", arguments: target({ url: restoreUrl }) } },
    { id: 11, method: "tools/call", params: { name: "pire_browser_state_load", arguments: target({ path: statePath, noRequireInspected: true }) } },
    { id: 12, method: "tools/call", params: { name: "pire_browser_wait_for_text", arguments: target({ text: "mcp-state-smoke", waitTimeoutMs: 30_000 }) } },
    { id: 13, method: "tools/call", params: { name: "pire_browser_get_text", arguments: target({ selector: "#local" }) } },
    { id: 14, method: "tools/call", params: { name: "pire_browser_get_text", arguments: target({ selector: "#session" }) } },
    { id: 15, method: "tools/call", params: { name: "pire_browser_get_text", arguments: target({ selector: "#cookie" }) } },
    { id: 16, method: "tools/call", params: { name: "pire_browser_storage_get", arguments: target({ area: "local", key: "pireStateLocal" }) } },
    { id: 17, method: "tools/call", params: { name: "pire_browser_storage_get", arguments: target({ area: "session", key: "pireStateSession" }) } },
    { id: 18, method: "tools/call", params: { name: "pire_browser_cookies_list", arguments: target() } },
    { id: 19, method: "tools/call", params: { name: "pire_browser_state_show", arguments: target({ path: statePath }) } },
    {
      id: 20,
      method: "tools/call",
      params: {
        name: "pire_browser_auth_save",
        arguments: target({
          name: "packed-mcp-auth",
          url: formUrl,
          username: "mcp-auth@example.com",
          password: "mcp-auth-secret",
          usernameSelector: "#email",
          passwordSelector: "#notes",
          submitSelector: "button",
        }),
      },
    },
    { id: 21, method: "tools/call", params: { name: "pire_browser_auth_list", arguments: target() } },
    { id: 22, method: "tools/call", params: { name: "pire_browser_auth_show", arguments: target({ name: "packed-mcp-auth" }) } },
    { id: 23, method: "tools/call", params: { name: "pire_browser_auth_login", arguments: target({ name: "packed-mcp-auth" }) } },
    { id: 24, method: "tools/call", params: { name: "pire_browser_wait_for_selector", arguments: target({ selector: "#done:not([hidden])", waitTimeoutMs: 30_000 }) } },
    { id: 25, method: "tools/call", params: { name: "pire_browser_eval", arguments: target({ script: "document.querySelector('#email').value" }) } },
    { id: 26, method: "tools/call", params: { name: "pire_browser_eval", arguments: target({ script: "document.querySelector('#notes').value" }) } },
    { id: 27, method: "tools/call", params: { name: "pire_browser_auth_delete", arguments: target({ name: "packed-mcp-auth" }) } },
    { id: 28, method: "tools/call", params: { name: "pire_browser_close", arguments: target() } },
  ].map((message) => JSON.stringify({ jsonrpc: "2.0", ...message })).join("\n") + "\n";
}

export function validatePackedMcpBrowserSmokeOutput(stdout) {
  const responses = parseMcpJsonLines(stdout, "MCP browser smoke");
  const byId = new Map(responses.map((response) => [String(response.id), response]));
  const initialized = byId.get("1");
  if (initialized?.result?.serverInfo?.name !== "pire-browser") {
    throw new Error("MCP browser smoke initialize response did not identify the pire-browser server");
  }
  for (const id of ["2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"]) {
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
  const close = byId.get("14");
  if (close?.error) {
    throw new Error(`MCP browser smoke close returned JSON-RPC error: ${close.error.message ?? JSON.stringify(close.error)}`);
  }
  return {
    responses: responses.length,
    serverVersion: initialized.result.serverInfo.version ?? null,
    closeWarning: close?.result?.isError === true ? String(close.result.content?.[0]?.text ?? "") : null,
  };
}

export function validatePackedMcpNetworkSmokeOutput(stdout, { harPath = null } = {}) {
  const responses = parseMcpJsonLines(stdout, "MCP network smoke");
  const byId = new Map(responses.map((response) => [String(response.id), response]));
  const initialized = byId.get("1");
  if (initialized?.result?.serverInfo?.name !== "pire-browser") {
    throw new Error("MCP network smoke initialize response did not identify the pire-browser server");
  }
  for (const id of ["2", "3", "4", "5", "6", "7", "8", "9", "10"]) {
    const response = byId.get(id);
    if (!response) throw new Error(`MCP network smoke missing response id ${id}`);
    if (response.error) {
      throw new Error(`MCP network smoke tool id ${id} returned JSON-RPC error: ${response.error.message ?? JSON.stringify(response.error)}`);
    }
    if (response.result?.isError === true) {
      throw new Error(`MCP network smoke tool id ${id} returned isError=true: ${response.result.content?.[0]?.text ?? ""}`);
    }
  }

  const request = mcpEnvelopeData(byId.get("5"), "MCP network smoke")?.request;
  if (!networkRecordMatchesFixture(request)) {
    throw new Error("MCP network smoke wait_for_request did not return the fixture fetch request");
  }
  const response = mcpEnvelopeData(byId.get("6"), "MCP network smoke")?.request;
  if (!networkRecordMatchesFixture(response) || response.statusCode !== 200) {
    throw new Error("MCP network smoke wait_for_response did not return a 2xx fixture response");
  }
  const requests = mcpEnvelopeData(byId.get("7"), "MCP network smoke")?.requests;
  if (!Array.isArray(requests) || !requests.some((record) => networkRecordMatchesFixture(record) && record.statusCode === 200)) {
    throw new Error("MCP network smoke requests listing did not include the fixture API response");
  }
  const har = mcpEnvelopeData(byId.get("8"), "MCP network smoke");
  if ((har?.count ?? 0) < 1 || !Array.isArray(har?.har?.log?.entries)) {
    throw new Error("MCP network smoke HAR stop did not return HAR entries");
  }
  if (!har.har.log.entries.some((entry) => String(entry?.request?.url ?? "").includes("/api/status.json"))) {
    throw new Error("MCP network smoke HAR did not include the fixture API URL");
  }
  if (harPath && !existsSync(harPath)) {
    throw new Error(`MCP network smoke expected HAR file was not created: ${harPath}`);
  }
  const resultText = String(byId.get("10")?.result?.content?.[0]?.text ?? "");
  if (!resultText.includes("network fixture ready")) {
    throw new Error("MCP network smoke get_text did not verify the fetched fixture result");
  }
  const close = byId.get("11");
  if (close?.error) {
    throw new Error(`MCP network smoke close returned JSON-RPC error: ${close.error.message ?? JSON.stringify(close.error)}`);
  }
  return {
    responses: responses.length,
    serverVersion: initialized.result.serverInfo.version ?? null,
    requests: requests.length,
    harEntries: har.har.log.entries.length,
    closeWarning: close?.result?.isError === true ? String(close.result.content?.[0]?.text ?? "") : null,
  };
}

export function validatePackedMcpFilesSmokeOutput(stdout, { uploadPath = null, downloadPath = null, waitDownloadPath = null } = {}) {
  const responses = parseMcpJsonLines(stdout, "MCP files smoke");
  const byId = new Map(responses.map((response) => [String(response.id), response]));
  const initialized = byId.get("1");
  if (initialized?.result?.serverInfo?.name !== "pire-browser") {
    throw new Error("MCP files smoke initialize response did not identify the pire-browser server");
  }
  for (const id of ["2", "3", "4", "5", "6", "7", "8"]) {
    const response = byId.get(id);
    if (!response) throw new Error(`MCP files smoke missing response id ${id}`);
    if (response.error) {
      throw new Error(`MCP files smoke tool id ${id} returned JSON-RPC error: ${response.error.message ?? JSON.stringify(response.error)}`);
    }
    if (response.result?.isError === true) {
      throw new Error(`MCP files smoke tool id ${id} returned isError=true: ${response.result.content?.[0]?.text ?? ""}`);
    }
  }

  const uploadText = String(byId.get("5")?.result?.content?.[0]?.text ?? "");
  if (!uploadText.includes("packed-mcp-upload.txt") || !uploadText.includes("packed MCP upload fixture")) {
    throw new Error("MCP files smoke upload summary did not verify uploaded file content");
  }
  const uploadResult = mcpEnvelopeData(byId.get("3"), "MCP files smoke");
  if ((uploadResult?.fileCount ?? 0) < 1) {
    throw new Error("MCP files smoke upload did not report an uploaded file");
  }
  for (const [path, label] of [
    [uploadPath, "upload source"],
    [downloadPath, "download"],
    [waitDownloadPath, "wait_download"],
  ]) {
    if (path && !existsSync(path)) {
      throw new Error(`MCP files smoke expected ${label} file was not created: ${path}`);
    }
  }
  for (const [path, label] of [
    [downloadPath, "download"],
    [waitDownloadPath, "wait_download"],
  ]) {
    if (!path) continue;
    const content = readFileSync(path, "utf8");
    if (!content.includes("packed MCP download fixture")) {
      throw new Error(`MCP files smoke ${label} file did not contain fixture content`);
    }
  }
  const close = byId.get("9");
  if (close?.error) {
    throw new Error(`MCP files smoke close returned JSON-RPC error: ${close.error.message ?? JSON.stringify(close.error)}`);
  }
  return {
    responses: responses.length,
    serverVersion: initialized.result.serverInfo.version ?? null,
    uploadVerified: true,
    downloadVerified: true,
    waitDownloadVerified: true,
    closeWarning: close?.result?.isError === true ? String(close.result.content?.[0]?.text ?? "") : null,
  };
}

export function validatePackedMcpStateSmokeOutput(stdout, { statePath = null } = {}) {
  const responses = parseMcpJsonLines(stdout, "MCP state smoke");
  const byId = new Map(responses.map((response) => [String(response.id), response]));
  const initialized = byId.get("1");
  if (initialized?.result?.serverInfo?.name !== "pire-browser") {
    throw new Error("MCP state smoke initialize response did not identify the pire-browser server");
  }
  for (const id of [
    "2", "3", "4", "5", "6", "7", "8", "9", "10",
    "11", "12", "13", "14", "15", "16", "17", "18",
    "19", "20", "21", "22", "23", "24", "25", "26", "27",
  ]) {
    const response = byId.get(id);
    if (!response) throw new Error(`MCP state smoke missing response id ${id}`);
    if (response.error) {
      throw new Error(`MCP state smoke tool id ${id} returned JSON-RPC error: ${response.error.message ?? JSON.stringify(response.error)}`);
    }
    if (response.result?.isError === true) {
      throw new Error(`MCP state smoke tool id ${id} returned isError=true: ${response.result.content?.[0]?.text ?? ""}`);
    }
  }

  for (const [id, expected, message] of [
    ["7", "EMPTY", "localStorage was not cleared before load"],
    ["8", "EMPTY", "sessionStorage was not cleared before load"],
    ["9", "EMPTY", "cookie was not cleared before load"],
    ["13", "mcp-state-smoke", "localStorage was not restored after load"],
    ["14", "EMPTY", "sessionStorage should remain ephemeral after v2 load"],
    ["15", "mcp-state-smoke", "cookie was not restored after load"],
    ["16", "mcp-state-smoke", "typed localStorage get did not verify restored value"],
    ["18", "pireStateCookie", "typed cookie list did not include restored cookie"],
    ["21", "packed-mcp-auth", "auth list did not include saved auth profile"],
    ["22", "packed-mcp-auth", "auth show did not describe saved auth profile"],
    ["25", "mcp-auth@example.com", "auth login did not fill username"],
    ["26", "mcp-auth-secret", "auth login did not fill password field"],
  ]) {
    const text = String(byId.get(id)?.result?.content?.[0]?.text ?? "");
    if (!text.includes(expected)) throw new Error(`MCP state smoke ${message}`);
  }
  for (const id of ["20", "21", "22"]) {
    const text = String(byId.get(id)?.result?.content?.[0]?.text ?? "");
    if (text.includes("mcp-auth-secret")) {
      throw new Error(`MCP state smoke auth tool id ${id} leaked the saved password`);
    }
  }

  const saved = mcpEnvelopeData(byId.get("4"), "MCP state smoke");
  const savedCounts = saved?.counts ?? saved ?? {};
  if ((savedCounts.cookies ?? 0) < 1 || (savedCounts.localStorageKeys ?? 0) < 1 || (savedCounts.origins ?? 0) < 1) {
    throw new Error("MCP state smoke save did not capture cookies and origin-keyed localStorage");
  }
  const loaded = mcpEnvelopeData(byId.get("11"), "MCP state smoke");
  const loadedCounts = loaded?.counts ?? loaded ?? {};
  const loadedImport = loaded?.import ?? loaded ?? {};
  if ((loadedCounts.cookies ?? 0) < 1 || (loadedCounts.localStorageKeys ?? 0) < 1 || (loadedCounts.origins ?? 0) < 1 || (loadedImport.cookiesSet ?? 0) < 1) {
    throw new Error("MCP state smoke load did not report restored cookies and origin-keyed localStorage");
  }
  const summary = mcpEnvelopeData(byId.get("19"), "MCP state smoke");
  const counts = summary?.counts ?? {};
  if ((counts.cookies ?? 0) < 1 || (counts.localStorageKeys ?? 0) < 1 || (counts.origins ?? 0) < 1) {
    throw new Error("MCP state smoke state_show did not report saved state counts");
  }
  if (statePath && !existsSync(statePath)) {
    throw new Error(`MCP state smoke expected state file was not created: ${statePath}`);
  }
  const close = byId.get("28");
  if (close?.error) {
    throw new Error(`MCP state smoke close returned JSON-RPC error: ${close.error.message ?? JSON.stringify(close.error)}`);
  }
  return {
    responses: responses.length,
    serverVersion: initialized.result.serverInfo.version ?? null,
    cookies: savedCounts.cookies,
    localStorageKeys: savedCounts.localStorageKeys,
    origins: savedCounts.origins,
    closeWarning: close?.result?.isError === true ? String(close.result.content?.[0]?.text ?? "") : null,
  };
}

function mcpEnvelopeData(response, label = "MCP smoke") {
  const structured = response?.result?.structuredContent;
  if (structured?.success !== true) {
    throw new Error(`${label} expected success envelope, got ${JSON.stringify(structured)}`);
  }
  return structured.data;
}

function networkRecordMatchesFixture(record) {
  return String(record?.url ?? "").includes("/api/status.json")
    && String(record?.method ?? "").toUpperCase() === "GET"
    && String(record?.type ?? "").toLowerCase() === "xmlhttprequest";
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
    const tempRoot = join(workRoot, "os-temp");
    const artifactDir = options.artifactDir;
    for (const dir of [commandCwd, prefix, localAppData, home, xdgDataHome, tempRoot, options.packDir, artifactDir]) {
      mkdirSync(dir, { recursive: true });
    }

    const smokePlatform = options.tuple.split("-")[0];
    const env = sanitizedSmokeEnv(process.env, {
      localAppData,
      home,
      xdgDataHome,
      tempRoot,
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
      tempRoot,
      tuple: options.tuple,
      browser: options.browser,
      signedXpi: options.signedXpi,
      firefoxPath: options.firefoxPath ?? null,
      rootTarball: null,
      platformTarball: null,
      installedPackageRoot: null,
      webExt: null,
      nativeResolution: null,
      mcp: null,
      mcpBrowser: null,
      mcpFiles: null,
      mcpNetwork: null,
      lifecycle: null,
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
    summary.webExt = assertInstalledWebExtDependency({
      packageRoot,
      platform: smokePlatform,
      cwd: packageRoot,
      env,
      recorder,
    });
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
      await runSessionLifecycleSmoke({
        command,
        commandCwd,
        env,
        workRoot,
        tempRoot,
        artifactDir,
        dataRoot,
        prefix,
        recorder,
        summary,
        stressCount: options.lifecycleStressCount,
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
      await runMcpFilesSmoke({
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
      await runMcpNetworkSmoke({
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
      await runMcpStateSmoke({
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

    const result = runPire(command, ["mcp", "--tools", "core"], {
      cwd: commandCwd,
      env,
      timeoutMs: 300_000,
      recorder,
      input: packedMcpBrowserSmokeInput({
        session: profile,
        url: fixture.url,
        screenshot,
        executablePath: firefoxPath,
      }),
    });
    modeResult.validation = validatePackedMcpBrowserSmokeOutput(result.stdout);
    if (!existsSync(screenshot)) throw new Error(`Expected MCP screenshot was not created: ${screenshot}`);
    modeResult.success = true;
  } finally {
    runPire(command, ["--session", profile, "close"], { cwd: commandCwd, env, allowFailure: true, recorder });
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

async function runMcpFilesSmoke({
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
  const mode = "mcp-files-web-ext";
  const fixture = await startFixtureServer({ artifactDir });
  const profile = `packed-${mode}-${Date.now()}`;
  const profilePath = join(dataRoot, "firefox-profiles", profile);
  const filesDir = join(artifactDir, "files");
  mkdirSync(filesDir, { recursive: true });
  const uploadPath = join(filesDir, "packed-mcp-upload.txt");
  const downloadPath = join(filesDir, `download-${mode}.txt`);
  const waitDownloadPath = join(filesDir, `wait-download-${mode}.txt`);
  const downloadDir = join(filesDir, "browser-downloads");
  mkdirSync(downloadDir, { recursive: true });
  writeFileSync(uploadPath, "packed MCP upload fixture\n");
  const modeResult = {
    mode,
    mcp: true,
    profile,
    profilePath,
    fixtureUrl: fixtureUrl(fixture, "files.html"),
    uploadPath,
    downloadPath,
    waitDownloadPath,
    downloadDir,
    success: false,
  };
  summary.profiles.push({ mode, profile, profilePath });
  summary.modes.push(modeResult);
  summary.mcpFiles = modeResult;
  writeSummary(summary, artifactDir, env);

  try {
    runPire(command, installCommandArgs({ firefoxPath }), { cwd: commandCwd, env, recorder });
    runPire(command, ["doctor", "--json"], { cwd: commandCwd, env, recorder });

    const result = runPire(command, ["mcp", "--tools", "core,state"], {
      cwd: commandCwd,
      env,
      timeoutMs: 300_000,
      recorder,
      input: packedMcpFilesSmokeInput({
        session: profile,
        url: modeResult.fixtureUrl,
        uploadPath,
        downloadPath,
        waitDownloadPath,
        downloadDir,
        executablePath: firefoxPath,
      }),
    });
    modeResult.validation = validatePackedMcpFilesSmokeOutput(result.stdout, { uploadPath, downloadPath, waitDownloadPath });
    modeResult.success = true;
  } finally {
    runPire(command, ["--session", profile, "close"], { cwd: commandCwd, env, allowFailure: true, recorder });
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

async function runMcpNetworkSmoke({
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
  const mode = "mcp-network-web-ext";
  const fixture = await startFixtureServer({ artifactDir });
  const profile = `packed-${mode}-${Date.now()}`;
  const profilePath = join(dataRoot, "firefox-profiles", profile);
  const harDir = join(artifactDir, "network");
  mkdirSync(harDir, { recursive: true });
  const harPath = join(harDir, `network-${mode}.har`);
  const modeResult = {
    mode,
    mcp: true,
    profile,
    profilePath,
    fixtureUrl: fixtureUrl(fixture, "network.html"),
    harPath,
    success: false,
  };
  summary.profiles.push({ mode, profile, profilePath });
  summary.modes.push(modeResult);
  summary.mcpNetwork = modeResult;
  writeSummary(summary, artifactDir, env);

  try {
    runPire(command, installCommandArgs({ firefoxPath }), { cwd: commandCwd, env, recorder });
    runPire(command, ["doctor", "--json"], { cwd: commandCwd, env, recorder });

    const result = runPire(command, ["mcp", "--tools", "core,network"], {
      cwd: commandCwd,
      env,
      timeoutMs: 300_000,
      recorder,
      input: packedMcpNetworkSmokeInput({
        session: profile,
        url: modeResult.fixtureUrl,
        harPath,
        executablePath: firefoxPath,
      }),
    });
    modeResult.validation = validatePackedMcpNetworkSmokeOutput(result.stdout, { harPath });
    modeResult.success = true;
  } finally {
    runPire(command, ["--session", profile, "close"], { cwd: commandCwd, env, allowFailure: true, recorder });
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

async function runMcpStateSmoke({
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
  const mode = "mcp-state-web-ext";
  const fixture = await startFixtureServer({ artifactDir });
  const profile = `packed-${mode}-${Date.now()}`;
  const profilePath = join(dataRoot, "firefox-profiles", profile);
  const stateDir = join(artifactDir, "state");
  mkdirSync(stateDir, { recursive: true });
  const statePath = join(stateDir, `state-${mode}.json`);
  const modeResult = {
    mode,
    mcp: true,
    profile,
    profilePath,
    fixtureUrl: fixtureUrl(fixture, "state.html?value=mcp-state-smoke"),
    clearUrl: fixtureUrl(fixture, "state.html?clear=1"),
    restoreUrl: fixtureUrl(fixture, "state.html"),
    formUrl: fixture.url,
    statePath,
    success: false,
  };
  summary.profiles.push({ mode, profile, profilePath });
  summary.modes.push(modeResult);
  summary.mcpState = modeResult;
  writeSummary(summary, artifactDir, env);

  try {
    runPire(command, installCommandArgs({ firefoxPath }), { cwd: commandCwd, env, recorder });
    runPire(command, ["doctor", "--json"], { cwd: commandCwd, env, recorder });

    const result = runPire(command, ["mcp", "--tools", "core,state"], {
      cwd: commandCwd,
      env,
      timeoutMs: 300_000,
      recorder,
      input: packedMcpStateSmokeInput({
        session: profile,
        url: modeResult.fixtureUrl,
        clearUrl: modeResult.clearUrl,
        restoreUrl: modeResult.restoreUrl,
        formUrl: modeResult.formUrl,
        statePath,
        executablePath: firefoxPath,
      }),
    });
    modeResult.validation = validatePackedMcpStateSmokeOutput(result.stdout, { statePath });
    modeResult.success = true;
  } finally {
    runPire(command, ["--session", profile, "close"], { cwd: commandCwd, env, allowFailure: true, recorder });
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
  let profilePath = null;
  let ephemeralRoot = null;
  const screenshotDir = join(artifactDir, "screenshots");
  mkdirSync(screenshotDir, { recursive: true });
  const screenshot = join(screenshotDir, `screenshot-${mode}.png`);
  const modeResult = {
    mode,
    profile,
    profilePath,
    ephemeralRoot,
    fixtureUrl: fixture.url,
    screenshot,
    success: false,
  };
  const profileSummary = { mode, profile, profilePath, ephemeralRoot };
  summary.profiles.push(profileSummary);
  summary.modes.push(modeResult);
  writeSummary(summary, artifactDir, env);

  try {
    runPire(command, installCommandArgs({ firefoxPath }), { cwd: commandCwd, env, recorder });
    runPire(command, ["doctor", "--json"], { cwd: commandCwd, env, recorder });

    const launchArgs = ["--session", profile, "launch", "--url", fixture.url];
    if (firefoxPath) launchArgs.push("--firefox-path", firefoxPath);
    runPire(command, launchArgs, {
      cwd: commandCwd,
      env,
      timeoutMs: 300_000,
      recorder,
      acceptErrorResult: isSuccessfulLaunchTimeout,
    });
    const sessionData = parseCliData(
      runPire(command, ["--session", profile, "session", "info", "--json"], {
        cwd: commandCwd,
        env,
        recorder,
      }).stdout,
      `session info for ${profile}`
    );
    profilePath = sessionData.selectedSession?.profilePath ?? null;
    ephemeralRoot = sessionData.selectedSession?.ephemeralRoot ?? null;
    modeResult.profilePath = profilePath;
    modeResult.ephemeralRoot = ephemeralRoot;
    profileSummary.profilePath = profilePath;
    profileSummary.ephemeralRoot = ephemeralRoot;

    const prefixArgs = ["--session", profile];
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
    runPire(command, ["--session", profile, "close"], { cwd: commandCwd, env, allowFailure: true, recorder });
    if (ephemeralRoot) await waitForPathGone(ephemeralRoot, 60_000);
    await fixture.close();
    copyDiagnostics({ dataRoot, artifactDir });
    if (process.platform === "win32") {
      cleanupWindowsProcesses({ workRoot, prefix, profilePaths: [profilePath].filter(Boolean), recorder, env });
    } else {
      cleanupUnixProcesses({ workRoot, prefix, profilePaths: [profilePath].filter(Boolean), recorder, env });
    }
    writeSummary(summary, artifactDir, env);
  }
}

async function runSessionLifecycleSmoke({
  command,
  commandCwd,
  env,
  workRoot,
  tempRoot,
  artifactDir,
  dataRoot,
  prefix,
  recorder,
  summary,
  stressCount = 0,
}) {
  const fixture = await startFixtureServer({ artifactDir });
  const stamp = Date.now();
  const namespace = `release-smoke-${stamp}`;
  const activeTargets = [];
  const result = {
    namespace,
    restore: null,
    ephemeralDownloads: null,
    explicitDownloads: null,
    namedSourceSnapshot: null,
    persistentProfile: null,
    abruptCleanup: null,
    stress: null,
    success: false,
  };
  summary.lifecycle = result;
  writeSummary(summary, artifactDir, env);

  const target = (session, options = []) => ["--namespace", namespace, "--session", session, ...options];
  const open = (session, url, options = []) => {
    const args = [...target(session, options), "open"];
    if (url) args.push(url);
    const commandResult = runPire(command, args, {
      cwd: commandCwd,
      env,
      timeoutMs: 300_000,
      recorder,
      acceptErrorResult: isSuccessfulLaunchTimeout,
    });
    activeTargets.push({ session, options });
    return commandResult;
  };
  const info = (session, options = []) => {
    const commandResult = runPire(command, [...target(session, options), "session", "info", "--json"], {
      cwd: commandCwd,
      env,
      recorder,
    });
    const data = parseCliData(commandResult.stdout, `session info for ${session}`);
    if (!data.selectedSession?.profilePath || !data.selectedSession?.ephemeralRoot) {
      throw new Error(`session info for ${session} did not include the live profile paths`);
    }
    return data;
  };
  const close = async (session, options = []) => {
    const selected = info(session, options).selectedSession;
    runPire(command, [...target(session, options), "close"], { cwd: commandCwd, env, recorder });
    removeActiveTarget(activeTargets, session);
    await waitForPathGone(selected.ephemeralRoot, 60_000);
    return selected;
  };
  const expectText = (session, selector, expected, options = []) => {
    const commandResult = runPire(command, [...target(session, options), "get", "text", selector], {
      cwd: commandCwd,
      env,
      recorder,
    });
    if (!String(commandResult.stdout).includes(expected)) {
      throw new Error(`expected ${selector} in ${session} to contain ${expected}`);
    }
  };

  try {
    const restoreSession = `restore-${stamp}`;
    const restoreKey = `auth-${stamp}`;
    const restoreOptions = ["--restore", restoreKey];
    const firstOriginValue = `first-${stamp}`;
    const secondOriginValue = `second-${stamp}`;
    const firstOrigin = fixtureUrl(fixture, `state.html?value=${firstOriginValue}`);
    const secondOrigin = fixtureUrl(fixture, `state.html?value=${secondOriginValue}`).replace("127.0.0.1", "localhost");
    open(restoreSession, firstOrigin, restoreOptions);
    runPire(command, [...target(restoreSession, restoreOptions), "wait", "--text", firstOriginValue], { cwd: commandCwd, env, recorder });
    runPire(command, [...target(restoreSession, restoreOptions), "navigate", secondOrigin], { cwd: commandCwd, env, recorder });
    runPire(command, [...target(restoreSession, restoreOptions), "wait", "--text", secondOriginValue], { cwd: commandCwd, env, recorder });
    const firstRestoreRoot = (await close(restoreSession, restoreOptions)).ephemeralRoot;
    const restorePath = join(dataRoot, "restore-sessions", namespace, `${restoreKey}.json`);
    if (!existsSync(restorePath)) throw new Error(`automatic restore state was not written: ${restorePath}`);

    open(restoreSession, fixtureUrl(fixture, "state.html"), restoreOptions);
    runPire(command, [...target(restoreSession, restoreOptions), "wait", "--text", firstOriginValue], { cwd: commandCwd, env, recorder });
    expectText(restoreSession, "#local", firstOriginValue, restoreOptions);
    expectText(restoreSession, "#cookie", firstOriginValue, restoreOptions);
    runPire(command, [...target(restoreSession, restoreOptions), "navigate", fixtureUrl(fixture, "state.html").replace("127.0.0.1", "localhost")], { cwd: commandCwd, env, recorder });
    runPire(command, [...target(restoreSession, restoreOptions), "wait", "--text", secondOriginValue], { cwd: commandCwd, env, recorder });
    expectText(restoreSession, "#local", secondOriginValue, restoreOptions);
    expectText(restoreSession, "#cookie", secondOriginValue, restoreOptions);
    const secondRestoreRoot = (await close(restoreSession, restoreOptions)).ephemeralRoot;
    result.restore = {
      key: restoreKey,
      path: restorePath,
      firstRootRemoved: !existsSync(firstRestoreRoot),
      secondRootRemoved: !existsSync(secondRestoreRoot),
      originsVerified: 2,
    };

    const temporaryDownloadSession = `temp-download-${stamp}`;
    open(temporaryDownloadSession, fixtureUrl(fixture, "files.html"));
    const temporaryInfo = info(temporaryDownloadSession).selectedSession;
    const temporaryDownloadDir = join(temporaryInfo.ephemeralRoot, "downloads");
    runPire(command, [...target(temporaryDownloadSession), "click", "#download-link"], { cwd: commandCwd, env, recorder });
    runPire(command, [...target(temporaryDownloadSession), "wait", "--download", "--timeout", "60000"], { cwd: commandCwd, env, recorder });
    const temporaryDownload = findFileContaining(temporaryDownloadDir, "packed MCP download fixture");
    if (!temporaryDownload) throw new Error("default session download was not created below the ephemeral root");
    await close(temporaryDownloadSession);
    result.ephemeralDownloads = {
      path: temporaryDownload,
      insideEphemeralRoot: isInside(temporaryDownload, temporaryInfo.ephemeralRoot),
      removedWithSession: !existsSync(temporaryInfo.ephemeralRoot),
    };

    const explicitDownloadSession = `durable-download-${stamp}`;
    const explicitDownloadDir = join(workRoot, "durable-downloads");
    mkdirSync(explicitDownloadDir, { recursive: true });
    const explicitDownloadOptions = ["--download-path", explicitDownloadDir];
    open(explicitDownloadSession, fixtureUrl(fixture, "files.html"), explicitDownloadOptions);
    const explicitInfo = info(explicitDownloadSession, explicitDownloadOptions).selectedSession;
    runPire(command, [...target(explicitDownloadSession, explicitDownloadOptions), "click", "#download-link"], { cwd: commandCwd, env, recorder });
    runPire(command, [...target(explicitDownloadSession, explicitDownloadOptions), "wait", "--download", "--timeout", "60000"], { cwd: commandCwd, env, recorder });
    const explicitDownload = findFileContaining(explicitDownloadDir, "packed MCP download fixture");
    if (!explicitDownload) throw new Error("explicit download path did not retain the downloaded fixture");
    await close(explicitDownloadSession, explicitDownloadOptions);
    result.explicitDownloads = {
      path: explicitDownload,
      profileRootRemoved: !existsSync(explicitInfo.ephemeralRoot),
      retainedAfterClose: existsSync(explicitDownload),
    };

    const persistentSession = `persistent-${stamp}`;
    const persistentProfile = join(workRoot, "durable-firefox-profile");
    const persistentOptions = ["--profile", persistentProfile];
    open(persistentSession, fixtureUrl(fixture, `state.html?value=persistent-${stamp}`), persistentOptions);
    const persistentInfo = info(persistentSession, persistentOptions).selectedSession;
    if (persistentInfo.profileKind !== "persistent" || !samePath(persistentInfo.profilePath, persistentProfile)) {
      throw new Error("explicit profile path did not launch as a persistent profile");
    }
    await close(persistentSession, persistentOptions);
    if (!existsSync(persistentProfile) || directoryFootprint(persistentProfile).files === 0) {
      throw new Error("explicit persistent profile was removed or left empty after close");
    }
    result.persistentProfile = {
      path: persistentProfile,
      retainedAfterClose: true,
      wrapperRootRemoved: !existsSync(persistentInfo.ephemeralRoot),
    };

    await delay(1000);
    const sourceName = `source-${stamp}`;
    runPire(command, ["profiles", "import", persistentProfile, "--name", sourceName], { cwd: commandCwd, env, recorder });
    const sourcePath = join(dataRoot, "firefox-profiles", sourceName);
    const sourceSentinel = join(sourcePath, "pire-source-sentinel.txt");
    writeFileSync(sourceSentinel, `immutable-${stamp}\n`);
    const beforeSource = directoryFingerprint(sourcePath);
    const snapshotSession = `snapshot-${stamp}`;
    const snapshotOptions = ["--profile", sourceName];
    open(snapshotSession, fixtureUrl(fixture, `state.html?value=snapshot-${stamp}`), snapshotOptions);
    const snapshotInfo = info(snapshotSession, snapshotOptions).selectedSession;
    if (snapshotInfo.profileKind !== "snapshot" || samePath(snapshotInfo.profilePath, sourcePath)) {
      throw new Error("named profile source did not launch from an isolated snapshot");
    }
    await close(snapshotSession, snapshotOptions);
    const afterSource = directoryFingerprint(sourcePath);
    if (beforeSource !== afterSource) throw new Error("named profile source changed while its snapshot was running");
    result.namedSourceSnapshot = {
      source: sourcePath,
      snapshot: snapshotInfo.profilePath,
      sourceUnchanged: true,
      snapshotRootRemoved: !existsSync(snapshotInfo.ephemeralRoot),
    };

    const abruptSession = `abrupt-${stamp}`;
    open(abruptSession, fixture.url);
    const abruptInfo = info(abruptSession).selectedSession;
    const markerPath = join(abruptInfo.ephemeralRoot, ".pire-browser-session.json");
    const marker = JSON.parse(readFileSync(markerPath, "utf8"));
    if (process.platform === "win32") {
      cleanupWindowsProcesses({ workRoot, prefix, profilePaths: [abruptInfo.profilePath], recorder, env });
    } else {
      cleanupUnixProcesses({ workRoot, prefix, profilePaths: [abruptInfo.profilePath], recorder, env });
    }
    removeActiveTarget(activeTargets, abruptSession);
    await delay(2500);
    const automaticallyRemoved = !existsSync(abruptInfo.ephemeralRoot);
    const doctorOrphanRoot = automaticallyRemoved
      ? createSyntheticOrphan({ tempRoot, namespace, marker, stamp })
      : abruptInfo.ephemeralRoot;
    ageOrphanMarker(doctorOrphanRoot);
    runPire(command, ["doctor", "--fix", "--json"], { cwd: commandCwd, env, recorder, timeoutMs: 300_000 });
    if (existsSync(doctorOrphanRoot)) throw new Error("doctor --fix did not remove the marked inactive orphan");
    result.abruptCleanup = {
      abruptRoot: abruptInfo.ephemeralRoot,
      automaticallyRemoved,
      doctorOrphanRoot,
      doctorRemovedMarkedOrphan: true,
    };

    const stressNamespace = `stress-${stamp}`;
    const baseline = lifecycleStorageFootprint({ dataRoot, tempRoot, namespace: stressNamespace });
    for (let index = 0; index < stressCount; index += 1) {
      const stressSession = `s${index}`;
      const stressTarget = ["--namespace", stressNamespace, "--session", stressSession, "--headless"];
      runPire(command, [...stressTarget, "open"], {
        cwd: commandCwd,
        env,
        timeoutMs: 300_000,
        recorder,
        acceptErrorResult: isSuccessfulLaunchTimeout,
      });
      const stressData = parseCliData(
        runPire(command, [...stressTarget, "session", "info", "--json"], { cwd: commandCwd, env, recorder }).stdout,
        `stress session ${index}`
      );
      const root = stressData.selectedSession?.ephemeralRoot;
      if (!root) throw new Error(`stress session ${index} did not report an ephemeral root`);
      runPire(command, [...stressTarget, "close"], { cwd: commandCwd, env, recorder });
      await waitForPathGone(root, 60_000);
    }
    const finalFootprint = lifecycleStorageFootprint({ dataRoot, tempRoot, namespace: stressNamespace });
    if (
      finalFootprint.temporary.files !== baseline.temporary.files ||
      finalFootprint.temporary.bytes !== baseline.temporary.bytes ||
      finalFootprint.appDataProfiles.files !== baseline.appDataProfiles.files ||
      finalFootprint.appDataProfiles.bytes !== baseline.appDataProfiles.bytes
    ) {
      throw new Error(`session lifecycle storage grew from ${JSON.stringify(baseline)} to ${JSON.stringify(finalFootprint)}`);
    }
    result.stress = { sessions: stressCount, baseline, final: finalFootprint };
    result.success = true;
  } finally {
    for (const active of [...activeTargets].reverse()) {
      runPire(command, [...target(active.session, active.options), "close"], {
        cwd: commandCwd,
        env,
        allowFailure: true,
        recorder,
      });
    }
    await fixture.close();
    copyDiagnostics({ dataRoot, artifactDir });
    if (process.platform === "win32") {
      cleanupWindowsProcesses({ workRoot, prefix, recorder, env });
    } else {
      cleanupUnixProcesses({ workRoot, prefix, recorder, env });
    }
    writeSummary(summary, artifactDir, env);
  }
}

function parseCliData(stdout, label) {
  let envelope;
  try {
    envelope = JSON.parse(String(stdout).trim());
  } catch (error) {
    throw new Error(`${label} did not return valid JSON: ${error.message}`);
  }
  if (envelope?.success !== true || !envelope.data) {
    throw new Error(`${label} returned an unsuccessful JSON envelope`);
  }
  return envelope.data;
}

function removeActiveTarget(targets, session) {
  const index = targets.findIndex((target) => target.session === session);
  if (index >= 0) targets.splice(index, 1);
}

export function samePath(left, right, platform = process.platform) {
  const normalize = (value) => {
    let path = String(value);
    if (platform === "win32") {
      path = path.replace(/^\\\\\?\\UNC\\/i, "\\\\").replace(/^\\\\\?\\/i, "");
    }
    const normalized = resolve(path);
    return platform === "win32" ? normalized.toLowerCase() : normalized;
  };
  return normalize(left) === normalize(right);
}

async function waitForPathGone(path, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (existsSync(path) && Date.now() < deadline) await delay(250);
  if (existsSync(path)) throw new Error(`timed out waiting for ephemeral cleanup: ${path}`);
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function walkFiles(rootPath) {
  if (!existsSync(rootPath)) return [];
  const files = [];
  const visit = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  visit(rootPath);
  return files.sort();
}

function findFileContaining(rootPath, expected) {
  return walkFiles(rootPath).find((path) => {
    try {
      return readFileSync(path, "utf8").includes(expected);
    } catch {
      return false;
    }
  }) ?? null;
}

function directoryFingerprint(rootPath) {
  const hash = createHash("sha256");
  for (const path of walkFiles(rootPath)) {
    hash.update(relative(rootPath, path).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(readFileSync(path));
    hash.update("\0");
  }
  return hash.digest("hex");
}

function directoryFootprint(rootPath) {
  const files = walkFiles(rootPath);
  return {
    files: files.length,
    bytes: files.reduce((total, path) => total + statSync(path).size, 0),
  };
}

export function lifecycleStorageFootprint({ dataRoot, tempRoot, namespace }) {
  return {
    temporary: directoryFootprint(join(tempRoot, "pire-browser", namespace, "sessions")),
    appDataProfiles: directoryFootprint(join(dataRoot, "firefox-profiles")),
  };
}

function createSyntheticOrphan({ tempRoot, namespace, marker, stamp }) {
  const rootPath = join(tempRoot, "pire-browser", namespace, "sessions", `doctor-orphan-${stamp}`);
  const profilePath = join(rootPath, "profile");
  mkdirSync(profilePath, { recursive: true });
  writeFileSync(join(profilePath, "orphan.txt"), "marked lifecycle orphan\n");
  writeFileSync(join(rootPath, ".pire-browser-session.json"), JSON.stringify({
    ...marker,
    nonce: `doctor-${stamp}`,
    sessionName: `doctor-${stamp}`,
    profileKind: "ephemeral",
    profilePath,
    profileOwned: true,
  }, null, 2));
  return rootPath;
}

function ageOrphanMarker(rootPath) {
  const path = join(rootPath, ".pire-browser-session.json");
  const marker = JSON.parse(readFileSync(path, "utf8"));
  marker.createdAt = Date.now() - (2 * 60 * 60 * 1000);
  writeFileSync(path, JSON.stringify(marker, null, 2));
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

function assertInstalledWebExtDependency({ packageRoot, platform = process.platform, cwd = packageRoot, env, recorder }) {
  const webExt = installedWebExtBin(packageRoot, platform);
  if (!existsSync(webExt)) {
    throw new Error(
      `Installed pire-browser package is missing local web-ext binary: ${webExt}. ` +
      "Reinstall with normal dependencies enabled before running browser smoke."
    );
  }
  const result = runChecked("Verify installed web-ext dependency", webExt, ["--version"], {
    cwd,
    env,
    shell: platform === "win32",
    timeoutMs: 30_000,
    recorder,
  });
  return {
    path: webExt,
    version: String(result.stdout || result.stderr || "").trim(),
  };
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
    baseUrl: `http://127.0.0.1:${port}`,
    port,
    pid: child.pid,
    stdoutPath,
    stderrPath,
    close: () => stopFixtureServer(child),
  };
}

function fixtureUrl(fixture, path) {
  return `${fixture.baseUrl}/${String(path).replace(/^\/+/, "")}`;
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
  for (const name of ["sessions", "profiles", "runtime", "restore-sessions", "maintenance", "host.log"]) {
    const source = join(sourceRoot, name);
    if (existsSync(source)) {
      rmSync(join(destRoot, name), { recursive: true, force: true });
      mkdirSync(destRoot, { recursive: true });
      cpSync(source, join(destRoot, name), { recursive: statSync(source).isDirectory() });
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

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await main(process.argv.slice(2)));
}
