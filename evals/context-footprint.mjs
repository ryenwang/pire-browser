import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { resolveNativeBinary, rootDir } from "../scripts/platform.mjs";

export const REQUIRED_CORE_TOOL_NAMES = Object.freeze([
  "pire_browser_open",
  "pire_browser_read",
  "pire_browser_snapshot",
  "pire_browser_back",
  "pire_browser_forward",
  "pire_browser_reload",
  "pire_browser_click",
  "pire_browser_fill",
  "pire_browser_type",
  "pire_browser_press",
  "pire_browser_check",
  "pire_browser_uncheck",
  "pire_browser_select",
  "pire_browser_scroll",
  "pire_browser_wait_ms",
  "pire_browser_wait_for_selector",
  "pire_browser_wait_for_text",
  "pire_browser_wait_for_load",
  "pire_browser_screenshot",
  "pire_browser_get_text",
  "pire_browser_get_url",
  "pire_browser_get_title",
  "pire_browser_tab_new",
  "pire_browser_tab_list",
  "pire_browser_tab_switch",
  "pire_browser_tab_close",
  "pire_browser_eval",
  "pire_browser_close",
  "pire_browser_tools_profiles",
]);

const OPTIONAL_CONFIRMATION_TOOLS = ["pire_browser_confirm", "pire_browser_deny"];
const MCP_PROTOCOL_VERSION = "2025-11-25";
const MODULE_PATH = fileURLToPath(import.meta.url);

export const CONTEXT_BUDGETS = Object.freeze({
  thinSkill: Object.freeze({ bytes: 2 * 1024, tokens: 512 }),
  agentContext: Object.freeze({ bytes: 8 * 1024, tokens: 2_048 }),
  cliRecommended: Object.freeze({ bytes: 32 * 1024, tokens: 8_192 }),
  cliFull: Object.freeze({ bytes: 96 * 1024, tokens: 24_576 }),
  initialize: Object.freeze({ bytes: 1024, tokens: 256 }),
  mcpCore: Object.freeze({ bytes: 96 * 1024, tokens: 24_576, tools: 35, pages: 1 }),
  mcpAll: Object.freeze({ bytes: 512 * 1024, tokens: 131_072 }),
});

export function measureContext(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  if (typeof text !== "string") throw new TypeError("Context must be a string or JSON value");
  const chars = text.length;
  return Object.freeze({
    bytes: Buffer.byteLength(text, "utf8"),
    chars,
    tokens: Math.ceil(chars / 4),
  });
}

export function canonicalToolName(name) {
  if (typeof name !== "string") return name;
  return name.startsWith("pire_browser_") ? name : `pire_browser_${name}`;
}

export function verifyUniqueToolNames(tools) {
  const names = tools.map((tool) => tool?.name);
  const duplicates = [...new Set(names.filter((name, index) => names.indexOf(name) !== index))];
  if (duplicates.length > 0) {
    throw new Error(`Duplicate MCP tool names: ${duplicates.join(", ")}`);
  }
  return Object.freeze({ count: names.length, names: Object.freeze([...names]) });
}

export function requiredCoreToolNames(toolNames) {
  const names = new Set(toolNames.map(canonicalToolName));
  const required = [...REQUIRED_CORE_TOOL_NAMES];
  if (OPTIONAL_CONFIRMATION_TOOLS.some((name) => names.has(name))) required.push(...OPTIONAL_CONFIRMATION_TOOLS);
  return Object.freeze({
    required: Object.freeze(required),
    missing: Object.freeze(required.filter((name) => !names.has(name))),
  });
}

export function validateContextFootprint({ coreTools, allTools, corePages, allPages, measurements, versions }) {
  const coreNames = verifyUniqueToolNames(coreTools).names;
  const allNames = verifyUniqueToolNames(allTools).names;
  const required = requiredCoreToolNames(coreNames);
  const checks = {
    coreToolLimit: coreTools.length <= CONTEXT_BUDGETS.mcpCore.tools,
    coreSinglePage: corePages.length === CONTEXT_BUDGETS.mcpCore.pages && corePages[0]?.nextCursor === undefined,
    allHasMoreTools: allTools.length > coreTools.length,
    allIsPaginated: allPages.length > 1 && allPages.some((page) => page.nextCursor !== undefined),
    coreBytesUnder35Percent: measurements.mcpCore.bytes < measurements.mcpAll.bytes * 0.35,
    coreTokensUnder35Percent: measurements.mcpCore.tokens < measurements.mcpAll.tokens * 0.35,
    thinSkillWithinBudget: measurements.thinSkill.bytes <= CONTEXT_BUDGETS.thinSkill.bytes
      && measurements.thinSkill.tokens <= CONTEXT_BUDGETS.thinSkill.tokens,
    agentContextWithinBudget: measurements.agentContext.bytes <= CONTEXT_BUDGETS.agentContext.bytes
      && measurements.agentContext.tokens <= CONTEXT_BUDGETS.agentContext.tokens,
    recommendedSkillWithinBudget: measurements.cliRecommended.bytes <= CONTEXT_BUDGETS.cliRecommended.bytes
      && measurements.cliRecommended.tokens <= CONTEXT_BUDGETS.cliRecommended.tokens,
    fullSkillWithinBudget: measurements.cliFull.bytes <= CONTEXT_BUDGETS.cliFull.bytes
      && measurements.cliFull.tokens <= CONTEXT_BUDGETS.cliFull.tokens,
    initializeWithinBudget: measurements.initialize.bytes <= CONTEXT_BUDGETS.initialize.bytes
      && measurements.initialize.tokens <= CONTEXT_BUDGETS.initialize.tokens,
    coreWithinBudget: measurements.mcpCore.bytes <= CONTEXT_BUDGETS.mcpCore.bytes
      && measurements.mcpCore.tokens <= CONTEXT_BUDGETS.mcpCore.tokens,
    allWithinBudget: measurements.mcpAll.bytes <= CONTEXT_BUDGETS.mcpAll.bytes
      && measurements.mcpAll.tokens <= CONTEXT_BUDGETS.mcpAll.tokens,
    releaseVersionAligned: typeof versions?.package === "string"
      && versions.package.length > 0
      && versions.server === versions.package,
    requiredCoreTools: required.missing.length === 0,
    coreToolNamesUnique: new Set(coreNames).size === coreNames.length,
    allToolNamesUnique: new Set(allNames).size === allNames.length,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  if (failures.length > 0) throw new Error(`Context footprint checks failed: ${failures.join(", ")}`);
  return Object.freeze({ passed: true, checks: Object.freeze(checks), failures: Object.freeze([]), missingCoreTools: required.missing });
}

export function resolveEvaluatorBinary({ binary, env = process.env, root = rootDir(), cwd = process.cwd(), platform, arch } = {}) {
  if (binary) {
    const path = resolve(binary);
    if (!existsSync(path)) throw new Error(`--binary points to a missing file: ${path}`);
    return Object.freeze({ ok: true, path, source: "argument" });
  }
  const result = resolveNativeBinary({ root, cwd, env, platform, arch });
  if (!result.ok) throw new Error(result.reason);
  return Object.freeze(result);
}

export async function runCommand(binary, args, { cwd = process.cwd(), env = process.env } = {}) {
  return await new Promise((resolveResult, reject) => {
    const child = spawn(binary, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (status, signal) => resolveResult({
      status,
      signal,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
  });
}

function commandOutput(result, args) {
  if (typeof result === "string") return result;
  const status = result?.status ?? result?.code ?? 0;
  if (status !== 0) throw new Error(`pire-browser ${args.join(" ")} failed with status ${status}: ${result?.stderr ?? ""}`.trim());
  return String(result?.stdout ?? result?.output ?? "");
}

export async function openMcpSubprocess({ binary, profile, cwd = process.cwd(), env = process.env } = {}) {
  const child = spawn(binary, ["mcp", "--tools", profile], {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const lines = createInterface({ input: child.stdout });
  const pending = [];
  let exited = false;
  let exitError = null;
  const exitedPromise = new Promise((resolveExit) => {
    child.once("error", (error) => {
      exitError = error;
      exited = true;
      resolveExit();
    });
    child.once("close", () => {
      exited = true;
      resolveExit();
    });
  });
  child.stderr.on("data", () => {});

  async function nextResponse() {
    while (true) {
      if (exitError) throw exitError;
      if (exited) throw new Error("MCP subprocess exited before returning a response");
      const line = await new Promise((resolveLine, rejectLine) => {
        const onLine = (value) => {
          cleanup();
          resolveLine(value);
        };
        const onClose = () => {
          cleanup();
          resolveLine(null);
        };
        const onError = (error) => {
          cleanup();
          rejectLine(error);
        };
        const cleanup = () => {
          lines.off("line", onLine);
          lines.off("close", onClose);
          lines.off("error", onError);
        };
        lines.once("line", onLine);
        lines.once("close", onClose);
        lines.once("error", onError);
      });
      if (line === null) throw new Error("MCP subprocess closed before returning a response");
      if (line.trim()) return JSON.parse(line);
    }
  }

  return {
    async request(request) {
      if (exited) throw exitError ?? new Error("MCP subprocess has exited");
      child.stdin.write(`${JSON.stringify(request)}\n`);
      return await nextResponse();
    },
    async close() {
      if (exited) return;
      lines.close();
      child.stdin.end();
      await Promise.race([exitedPromise, new Promise((resolveExit) => setTimeout(resolveExit, 250))]);
      if (!exited) child.kill();
    },
  };
}

function rpcResult(response, label) {
  if (response?.error) throw new Error(`${label} failed: ${response.error.message ?? JSON.stringify(response.error)}`);
  return response?.result ?? response;
}

export async function collectMcpTools(session) {
  const pages = [];
  const responses = [];
  const tools = [];
  let cursor;
  let requestId = 2;
  do {
    const params = cursor === undefined ? {} : { cursor };
    const page = rpcResult(await session.request({ jsonrpc: "2.0", id: requestId++, method: "tools/list", params }), "tools/list");
    if (!Array.isArray(page.tools)) throw new Error("MCP tools/list response did not contain a tools array");
    responses.push(page);
    pages.push({ toolCount: page.tools.length, nextCursor: page.nextCursor });
    tools.push(...page.tools);
    if (page.nextCursor !== undefined && (typeof page.nextCursor !== "string" || page.nextCursor.length === 0)) {
      throw new Error("MCP tools/list nextCursor must be a non-empty string");
    }
    if (cursor !== undefined && page.nextCursor === cursor) throw new Error("MCP tools/list returned the same nextCursor twice");
    cursor = page.nextCursor;
  } while (cursor !== undefined);
  verifyUniqueToolNames(tools);
  return Object.freeze({ pages: Object.freeze(pages), responses: Object.freeze(responses), tools: Object.freeze(tools) });
}

async function collectMcpProfile({ openMcp, binary, profile, cwd, env }) {
  const session = await openMcp({ binary, profile, cwd, env });
  try {
    const initialize = rpcResult(await session.request({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "pire-browser-context-footprint", version: "1.0.0" },
      },
    }), "initialize");
    const collected = await collectMcpTools(session);
    return Object.freeze({ initialize, ...collected });
  } finally {
    await session.close?.();
  }
}

function profileMeasurement(profile) {
  return measureContext(profile.responses);
}

function defaultThinSkill(root) {
  for (const candidate of [join(root, "skills", "pire-browser", "SKILL.md"), join(root, "skills", "SKILL.md")]) {
    if (existsSync(candidate)) return { path: candidate, text: readFileSync(candidate, "utf8") };
  }
  throw new Error(`Could not find the thin skill below ${join(root, "skills")}`);
}

export async function evaluateContextFootprint({
  binary,
  binaryInfo,
  root = rootDir(),
  cwd = process.cwd(),
  env = process.env,
  thinSkillText,
  thinSkillPath,
  agentContextText,
  agentContextPath = join(root, "agent", "CONTEXT.md"),
  run = runCommand,
  openMcp = openMcpSubprocess,
  packageVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version,
} = {}) {
  const resolved = binaryInfo ?? (binary ? { ok: true, path: binary, source: "provided" } : resolveEvaluatorBinary({ root, cwd, env }));
  const thin = thinSkillText === undefined
    ? (thinSkillPath ? { path: thinSkillPath, text: readFileSync(thinSkillPath, "utf8") } : defaultThinSkill(root))
    : { path: thinSkillPath ?? null, text: String(thinSkillText) };
  const agentContext = agentContextText === undefined
    ? { path: agentContextPath, text: readFileSync(agentContextPath, "utf8") }
    : { path: agentContextPath ?? null, text: String(agentContextText) };

  const skillsListArgs = ["skills", "list"];
  const recommendedArgs = ["skills", "get", "core"];
  const fullArgs = ["skills", "get", "core", "--full"];
  const skillsList = commandOutput(await run(resolved.path, skillsListArgs, { cwd, env }), skillsListArgs);
  const recommended = commandOutput(await run(resolved.path, recommendedArgs, { cwd, env }), recommendedArgs);
  const full = commandOutput(await run(resolved.path, fullArgs, { cwd, env }), fullArgs);
  const [core, all] = await Promise.all([
    collectMcpProfile({ openMcp, binary: resolved.path, profile: "core", cwd, env }),
    collectMcpProfile({ openMcp, binary: resolved.path, profile: "all", cwd, env }),
  ]);

  const measurements = {
    thinSkill: measureContext(thin.text),
    agentContext: measureContext(agentContext.text),
    cliRecommended: measureContext(recommended),
    cliFull: measureContext(full),
    initialize: measureContext(core.initialize),
    mcpCore: profileMeasurement(core),
    mcpAll: profileMeasurement(all),
  };
  const validation = validateContextFootprint({
    coreTools: core.tools,
    allTools: all.tools,
    corePages: core.pages,
    allPages: all.pages,
    measurements,
    versions: { package: packageVersion, server: core.initialize?.serverInfo?.version },
  });
  return {
    binary: { path: resolved.path, source: resolved.source },
    versions: { package: packageVersion, server: core.initialize?.serverInfo?.version ?? null },
    thinSkill: { path: thin.path, measurement: measurements.thinSkill },
    agentContext: { path: agentContext.path, measurement: measurements.agentContext },
    commands: {
      skillsList: { args: skillsListArgs, measurement: measureContext(skillsList) },
      cliRecommended: { args: recommendedArgs, measurement: measurements.cliRecommended },
      cliFull: { args: fullArgs, measurement: measurements.cliFull },
    },
    mcp: {
      initialize: { measurement: measurements.initialize },
      core: { pageCount: core.pages.length, pageSizes: core.pages.map((page) => page.toolCount), toolNames: core.tools.map((tool) => tool.name), measurement: measurements.mcpCore },
      all: { pageCount: all.pages.length, pageSizes: all.pages.map((page) => page.toolCount), toolNames: all.tools.map((tool) => tool.name), measurement: measurements.mcpAll },
    },
    measurements,
    validation,
  };
}

export function parseArguments(args) {
  const parsed = { binary: undefined, output: undefined, json: false };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") parsed.json = true;
    else if (arg === "--binary" || arg === "--output") {
      if (!args[index + 1]) throw new Error(`${arg} requires a value`);
      parsed[arg.slice(2)] = args[++index];
    } else if (arg.startsWith("--binary=") || arg.startsWith("--output=")) {
      const [flag, ...value] = arg.split("=");
      if (!value.join("=")) throw new Error(`${flag} requires a value`);
      parsed[flag.slice(2)] = value.join("=");
    } else if (arg === "--help" || arg === "-h") parsed.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return parsed;
}

export function defaultOutputPath(root = rootDir()) {
  return join(root, "target", "evals", "context-footprint.json");
}

export async function main(args = process.argv.slice(2), io = console) {
  const parsed = parseArguments(args);
  if (parsed.help) {
    io.log("Usage: node evals/context-footprint.mjs [--binary <path>] [--output <path>] [--json]");
    return 0;
  }
  const root = rootDir();
  const binaryInfo = resolveEvaluatorBinary({ binary: parsed.binary, root });
  const result = await evaluateContextFootprint({ root, binaryInfo });
  const output = resolve(parsed.output ?? defaultOutputPath(root));
  mkdirSync(dirname(output), { recursive: true });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  writeFileSync(output, serialized, "utf8");
  if (parsed.json) io.log(serialized.trimEnd());
  else io.log(`Wrote ${output}`);
  return 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === pathToFileURL(MODULE_PATH).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
