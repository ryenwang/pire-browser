import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const BASELINE_VERSION = "0.26.0";
export const BASELINE_PACKAGE = "agent-browser";
export const BASELINE_COMMIT = "7ada3384e2afb5f3c43d9106389da86d8f807dca";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, "..", "..");
export const ORACLE_ROOT = join(REPO_ROOT, "target", "agent-browser-oracle");
export const ORACLE_NPM_ROOT = join(ORACLE_ROOT, "npm");
export const ORACLE_RUNS_ROOT = join(ORACLE_ROOT, "runs");
export const ORACLE_CASES_PATH = join(REPO_ROOT, "fixtures", "oracle", "cases.json");
export const ORACLE_FIXTURE_ROOT = join(REPO_ROOT, "fixtures", "oracle");
export const BASELINE_METADATA_PATH = join(REPO_ROOT, "docs", "agent-browser-oracle-baseline.json");
export const COMPATIBILITY_PATH = join(REPO_ROOT, "docs", "agent-browser-compatibility.json");

export function expectedOracleVersion() {
  return process.env.AGENT_BROWSER_ORACLE_VERSION || BASELINE_VERSION;
}

export function readBaselineMetadata() {
  return JSON.parse(readFileSync(BASELINE_METADATA_PATH, "utf8"));
}

export async function loadCases(path = ORACLE_CASES_PATH) {
  const data = JSON.parse(await readFile(path, "utf8"));
  const cases =
    data.schemaVersion === 1
      ? data.cases.map(normalizeV1Case)
      : data.schemaVersion === 2
        ? data.cases.map(normalizeV2Case)
        : null;
  if (!cases || !Array.isArray(cases)) {
    throw new Error(`Invalid oracle case file: ${path}`);
  }
  validateCases(cases);
  return cases;
}

export async function loadCompatibility(path = COMPATIBILITY_PATH) {
  return JSON.parse(await readFile(path, "utf8"));
}

function validateCases(cases) {
  const ids = new Set();
  for (const testCase of cases) {
    if (!testCase.id || typeof testCase.id !== "string") {
      throw new Error("Every oracle case needs a string id");
    }
    if (ids.has(testCase.id)) throw new Error(`Duplicate oracle case id: ${testCase.id}`);
    ids.add(testCase.id);
    if (!Array.isArray(testCase.steps) || testCase.steps.length === 0) {
      throw new Error(`Oracle case ${testCase.id} needs at least one step`);
    }
    const stepIds = new Set();
    for (const step of testCase.steps) {
      if (!step.id || typeof step.id !== "string") {
        throw new Error(`Oracle case ${testCase.id} has a step without a string id`);
      }
      if (stepIds.has(step.id)) throw new Error(`Duplicate step id in ${testCase.id}: ${step.id}`);
      stepIds.add(step.id);
      if (!step.command || typeof step.command !== "string") {
        throw new Error(`Oracle step ${testCase.id}/${step.id} needs a command string`);
      }
    }
  }
}

// Legacy schema support exists only to read old run fixtures during the
// Milestone 0 transition. Remove after one release with no tracked v1 cases.
function normalizeV1Case(testCase) {
  const setupSteps = (testCase.setup ?? []).map((step, index) => ({
    id: `setup-${index + 1}`,
    command: step.command,
    assertions: assertionsFromLegacyMode({
      compareMode: "exitOnly",
      expectedExitCode: step.expectedExitCode ?? 0,
    }),
    captures: step.captureRefs ? [{ name: "legacy", source: "stdout", legacy: true }] : [],
    legacySetup: true,
  }));
  return normalizeV2Case({
    id: testCase.id,
    status: testCase.status,
    compatibilityItems: [
      {
        id: testCase.id,
        status: testCase.status ?? "unknown",
        tapeCovered: false,
      },
    ],
    steps: [
      ...setupSteps,
      {
        id: "case",
        command: testCase.command,
        assertions: assertionsFromLegacyMode(testCase),
      },
    ],
    legacyCompareMode: testCase.compareMode,
  });
}

function assertionsFromLegacyMode(testCase) {
  const expectedExitCode = testCase.expectedExitCode ?? 0;
  if (testCase.compareMode === "pireNotAvailable") {
    return [{ type: "notAvailableError", tool: "pire-browser" }];
  }
  if (testCase.compareMode === "contains") {
    return [
      { type: "exitCodeEquals", value: expectedExitCode },
      ...(testCase.expectedStdout ?? []).map((value) => ({ type: "stdoutContains", value })),
    ];
  }
  if (testCase.compareMode === "normalizedText") {
    return [{ type: "exitCodeEquals", value: expectedExitCode }, { type: "stdoutNormalizedEquals" }];
  }
  if (testCase.compareMode === "jsonShape") {
    return [{ type: "exitCodeEquals", value: expectedExitCode }, { type: "jsonShape" }];
  }
  return [{ type: "exitCodeEquals", value: expectedExitCode }];
}

function normalizeV2Case(testCase) {
  return {
    id: testCase.id,
    description: testCase.description ?? "",
    status: testCase.status ?? "unknown",
    bail: testCase.bail ?? true,
    visibleSafe: Boolean(testCase.visibleSafe),
    fixture: testCase.fixture ?? "form.html",
    compatibilityItems: testCase.compatibilityItems ?? [],
    legacyCompareMode: testCase.legacyCompareMode,
    steps: testCase.steps.map((step, index) => ({
      id: step.id ?? `step-${index + 1}`,
      command: step.command,
      bail: step.bail,
      assertions: step.assertions ?? [{ type: "exitCodeEquals", value: step.expectedExitCode ?? 0 }],
      captures: step.captures ?? [],
      visible: step.visible,
    })),
    finalAssertions: testCase.finalAssertions ?? [],
  };
}

export function nativeBinaryName(prefix) {
  const platform = process.platform;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (platform === "win32") return `${prefix}-win32-${arch}.exe`;
  if (platform === "darwin") return `${prefix}-darwin-${arch}`;
  if (platform === "linux") return `${prefix}-linux-${arch}`;
  return null;
}

export function nativeBinaryNameCandidates(prefix) {
  const primary = nativeBinaryName(prefix);
  const platform =
    process.platform === "win32"
      ? "win32"
      : process.platform === "darwin"
        ? "darwin"
        : process.platform === "linux"
          ? "linux"
          : null;
  const ext = process.platform === "win32" ? ".exe" : "";
  const alternates = platform
    ? [`${prefix}-${platform}-x64${ext}`, `${prefix}-${platform}-arm64${ext}`]
    : [];
  const ordered = process.platform === "win32" ? [...alternates, primary] : [primary, ...alternates];
  return [...new Set(ordered.filter(Boolean))];
}

export function resolveAgentBrowserExecutable({ requireExists = true } = {}) {
  const envPath = process.env.AGENT_BROWSER_ORACLE_EXE;
  if (envPath) return resolve(envPath);

  const packageRoot = join(ORACLE_NPM_ROOT, "node_modules", BASELINE_PACKAGE);
  const candidates = [
    ...nativeBinaryNameCandidates(BASELINE_PACKAGE).map((binaryName) => join(packageRoot, "bin", binaryName)),
    process.platform === "win32"
      ? join(ORACLE_NPM_ROOT, "node_modules", ".bin", "agent-browser.cmd")
      : join(ORACLE_NPM_ROOT, "node_modules", ".bin", "agent-browser"),
    join(packageRoot, "bin", "agent-browser.js"),
  ].filter(Boolean);

  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found && requireExists) {
    throw new Error("Pinned agent-browser oracle is not installed. Run: npm run oracle:install");
  }
  return found || candidates[0];
}

export function readInstalledAgentBrowserVersion() {
  const packageJson = join(ORACLE_NPM_ROOT, "node_modules", BASELINE_PACKAGE, "package.json");
  if (!existsSync(packageJson)) return null;
  return JSON.parse(readFileSync(packageJson, "utf8")).version ?? null;
}

export function verifyInstalledAgentBrowserVersion({ allowOverride = false } = {}) {
  const expected = expectedOracleVersion();
  const installed = readInstalledAgentBrowserVersion();
  if (!installed) throw new Error("agent-browser oracle package is not installed");
  if (installed !== expected) {
    const extra =
      allowOverride || process.env.AGENT_BROWSER_ORACLE_REFRESH === "1"
        ? ""
        : " Set AGENT_BROWSER_ORACLE_REFRESH=1 only when intentionally refreshing the baseline.";
    throw new Error(`agent-browser oracle version mismatch: expected ${expected}, found ${installed}.${extra}`);
  }
  return installed;
}

export function resolvePireExecutable({ requireExists = true } = {}) {
  const suffix = process.platform === "win32" ? ".exe" : "";
  const envPath = process.env.PIRE_BROWSER_EXE;
  const candidates = [
    envPath ? resolve(envPath) : null,
    join(REPO_ROOT, "target", "debug", `pire-browser${suffix}`),
    join(REPO_ROOT, "target", "release", `pire-browser${suffix}`),
    join(REPO_ROOT, "bin", "win32-x64", `pire-browser${suffix}`),
    `pire-browser${suffix}`,
  ].filter(Boolean);
  const found = candidates.find((candidate) => candidate === `pire-browser${suffix}` || existsSync(candidate));
  if (!found && requireExists) throw new Error("pire-browser executable not found. Build it or set PIRE_BROWSER_EXE.");
  return found || candidates[0];
}

export function splitCommand(command) {
  const args = [];
  let current = "";
  let quote;
  let escaping = false;
  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (quote) throw new Error(`Unclosed quote in command: ${command}`);
  if (escaping) current += "\\";
  if (current) args.push(current);
  return args;
}

export function renderTemplate(template, values) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, key) => {
    const value = key.split(".").reduce((acc, part) => (acc == null ? undefined : acc[part]), values);
    if (value == null || value === "") throw new Error(`Missing template value: ${key}`);
    return String(value);
  });
}

export async function runCommand(executable, args, options = {}) {
  const startedAt = Date.now();
  const timeoutMs = options.timeoutMs ?? 45_000;
  const cwd = options.cwd ?? REPO_ROOT;
  const env = { ...process.env, ...(options.env ?? {}) };
  const resolveOnOutputIdleMs = options.resolveOnOutputIdleMs ?? 0;
  mkdirSync(options.logDir ?? ORACLE_ROOT, { recursive: true });

  return new Promise((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let idleTimer;
    let child;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (idleTimer) clearTimeout(idleTimer);
      destroyChildOutput(child);
      resolvePromise(result);
    };
    try {
      child = spawn(executable, args, {
        cwd,
        env,
        windowsHide: options.windowsHide ?? true,
        shell: false,
      });
    } catch (error) {
      return resolvePromise({
        executable,
        args,
        stdout,
        stderr: error.message,
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        timedOut: false,
        finishReason: "spawn-error",
      });
    }
    const scheduleOutputIdleFinish = () => {
      if (!resolveOnOutputIdleMs || settled || (!stdout && !stderr)) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        finish({
          executable,
          args,
          stdout,
          stderr,
          exitCode: stderr.trim() && !stdout.trim() ? 1 : 0,
          durationMs: Date.now() - startedAt,
          timedOut: false,
          outputIdle: true,
          finishReason: "output-idle",
        });
      }, resolveOnOutputIdleMs);
      idleTimer.unref?.();
    };
    const timer = setTimeout(() => {
      if (settled) return;
      killChild(child);
      finish({
        executable,
        args,
        stdout,
        stderr: `${stderr}\nCommand timed out after ${timeoutMs}ms`.trim(),
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        timedOut: true,
        finishReason: "timeout",
      });
    }, timeoutMs);
    timer.unref?.();

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      scheduleOutputIdleFinish();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      scheduleOutputIdleFinish();
    });
    child.on("error", (error) => {
      if (settled) return;
      finish({
        executable,
        args,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        timedOut: false,
        finishReason: "error",
      });
    });
    child.on("close", (exitCode) => {
      if (settled) return;
      finish({
        executable,
        args,
        stdout,
        stderr,
        exitCode: exitCode ?? 0,
        durationMs: Date.now() - startedAt,
        timedOut: false,
        finishReason: "close",
      });
    });
  });
}

function killChild(child) {
  try {
    child?.kill();
  } catch {
    // Already gone.
  }
}

function destroyChildOutput(child) {
  try {
    child?.stdout?.destroy?.();
  } catch {
    // Already closed.
  }
  try {
    child?.stderr?.destroy?.();
  } catch {
    // Already closed.
  }
}

export function normalizeOutput(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\bref=e\d+\b/g, "ref=@REF")
    .replace(/@e\d+/g, "@REF")
    .replace(/\bt\d+\b/g, "tTAB")
    .replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:PORT")
    .replace(/localhost:\d+/g, "localhost:PORT")
    .replace(/\b\d+ms\b/g, "<MS>")
    .replace(/\bChrome\b|\bChromium\b|\bFirefox\b/g, "<BROWSER>")
    .replace(/[A-Z]:\\[^\s"']+/g, "<PATH>")
    .replace(/\/[^\s"']*agent-browser-oracle[^\s"']*/g, "<PATH>")
    .trim();
}

export function extractRefs(snapshotText) {
  const refs = {};
  const lines = String(snapshotText ?? "").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/(@e\d+)|\bref=e(\d+)\b/);
    if (!match) continue;
    const ref = match[1] ?? `@e${match[2]}`;
    const lower = line.toLowerCase();
    if (!refs.email && (lower.includes("email") || lower.includes("hello@example.com"))) refs.email = ref;
    if (!refs.notes && (lower.includes("notes") || lower.includes("write notes"))) refs.notes = ref;
    if (!refs.submit && lower.includes("submit")) refs.submit = ref;
    if (!refs.heading && lower.includes("oracle fixture")) refs.heading = ref;
  }
  return refs;
}

export function captureRefsFromText(text, captures = []) {
  const refs = {};
  for (const capture of captures) {
    if (capture.legacy) Object.assign(refs, extractRefs(text));
    else if (capture.name) {
      const ref = captureRef(text, capture);
      if (ref && !refs[capture.name]) refs[capture.name] = ref;
    }
  }
  return refs;
}

function captureRef(text, capture) {
  const raw = String(text ?? "");
  if (capture.regex) {
    const match = raw.match(new RegExp(capture.regex, capture.flags ?? "i"));
    if (!match) return null;
    const value = match[capture.group ?? 1] ?? match[0];
    if (capture.kind === "text" || capture.type === "text") return value;
    return normalizeRef(value);
  }
  const lines = raw.split(/\r?\n/);
  const includes = (capture.lineIncludes ?? capture.includes ?? []).map((item) => String(item).toLowerCase());
  const lineRegex = capture.lineRegex ? new RegExp(capture.lineRegex, capture.flags ?? "i") : null;
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (includes.length && !includes.every((item) => lower.includes(item))) continue;
    if (lineRegex && !lineRegex.test(line)) continue;
    const ref = extractFirstRef(line);
    if (ref) return ref;
  }
  return null;
}

function normalizeRef(value) {
  const match = String(value ?? "").match(/@e\d+|ref=e(\d+)/);
  if (!match) return null;
  return match[1] ? `@e${match[1]}` : match[0];
}

function extractFirstRef(line) {
  const match = String(line ?? "").match(/(@e\d+)|\bref=e(\d+)\b/);
  if (!match) return null;
  return match[1] ?? `@e${match[2]}`;
}

export function evaluateResultAssertions(assertions, agentResult, pireResult) {
  return assertions.map((assertion) => evaluateResultAssertion(assertion, agentResult, pireResult));
}

export function evaluateResultAssertion(assertion, agentResult, pireResult) {
  const type = assertion.type ?? assertion;
  if (type === "exitCodeEquals") {
    const expected = assertion.value ?? 0;
    const pass = agentResult.exitCode === expected && pireResult.exitCode === expected;
    return {
      type,
      pass,
      reason: pass
        ? `exit codes matched ${expected}`
        : `exit code mismatch; expected ${expected}, agent-browser=${agentResult.exitCode}, pire-browser=${pireResult.exitCode}`,
    };
  }
  if (type === "exitCodeNonZero") {
    const tools = selectAssertionTools(assertion);
    const pass = tools.every((tool) => resultForTool(tool, agentResult, pireResult).exitCode !== 0);
    return {
      type,
      pass,
      reason: pass ? "exit codes were nonzero" : "expected nonzero exit code",
    };
  }
  if (type === "stdoutContains") {
    const value = assertion.value ?? assertion.text;
    const normalizedValue = normalizeOutput(value).toLowerCase();
    const pass = [agentResult, pireResult].every((result) => {
      const raw = String(result.stdout ?? "").toLowerCase();
      const normalized = normalizeOutput(result.stdout).toLowerCase();
      return raw.includes(String(value).toLowerCase()) || normalized.includes(normalizedValue);
    });
    return {
      type,
      pass,
      reason: pass ? `stdout contains ${value}` : `stdout missing ${value}`,
    };
  }
  if (type === "stderrNormalizedContains") {
    const value = normalizeOutput(assertion.value ?? assertion.text);
    const tools = selectAssertionTools(assertion);
    const pass = tools.every((tool) => normalizeOutput(resultForTool(tool, agentResult, pireResult).stderr).includes(value));
    return {
      type,
      pass,
      reason: pass ? `stderr contains ${value}` : `stderr missing ${value}`,
    };
  }
  if (type === "outputContains") {
    const value = assertion.value ?? assertion.text;
    const normalizedValue = normalizeOutput(value).toLowerCase();
    const tools = selectAssertionTools(assertion);
    const pass = tools.every((tool) => {
      const result = resultForTool(tool, agentResult, pireResult);
      const output = `${result.stdout}\n${result.stderr}`;
      return output.toLowerCase().includes(String(value).toLowerCase()) || normalizeOutput(output).toLowerCase().includes(normalizedValue);
    });
    return {
      type,
      pass,
      reason: pass ? `output contains ${value}` : `output missing ${value}`,
    };
  }
  if (type === "stdoutNormalizedEquals") {
    const agentNorm = normalizeOutput(agentResult.stdout);
    const pireNorm = normalizeOutput(pireResult.stdout);
    const expected = assertion.value == null ? null : normalizeOutput(assertion.value);
    const pass = expected == null ? agentNorm === pireNorm : agentNorm === expected && pireNorm === expected;
    return {
      type,
      pass,
      reason: pass ? "normalized stdout matched" : "normalized stdout differed",
    };
  }
  if (type === "jsonShape") {
    try {
      JSON.parse(agentResult.stdout);
      JSON.parse(pireResult.stdout);
      return { type, pass: true, reason: "both outputs parsed as JSON" };
    } catch (error) {
      return { type, pass: false, reason: `JSON parse failed: ${error.message}` };
    }
  }
  if (type === "notAvailableError") {
    const tools = selectAssertionTools(assertion);
    const pass = tools.every((tool) => {
      const result = resultForTool(tool, agentResult, pireResult);
      return result.exitCode !== 0 && /not[_ -]?available|unsupported|not implemented|NotAvailableError/i.test(`${result.stdout}\n${result.stderr}`);
    });
    return { type, pass, reason: pass ? "stable not-available failure" : "not-available failure shape missing" };
  }
  if (type === "errorNameEquals" || type === "errorCodeEquals") {
    const value = assertion.value;
    const combined = `${agentResult.stdout}\n${agentResult.stderr}\n${pireResult.stdout}\n${pireResult.stderr}`;
    const pass = value ? combined.includes(value) : normalizeOutput(agentResult.stderr) === normalizeOutput(pireResult.stderr);
    return { type, pass, reason: pass ? `${type} matched` : `${type} differed` };
  }
  return { type, pass: false, reason: `unknown assertion type: ${type}` };
}

function selectAssertionTools(assertion) {
  if (assertion.tool) return [assertion.tool];
  if (Array.isArray(assertion.tools)) return assertion.tools;
  return ["agent-browser", "pire-browser"];
}

function resultForTool(tool, agentResult, pireResult) {
  return tool === "agent-browser" ? agentResult : pireResult;
}

export function summarizeOracleCoverage(cases, { onlyPassing = false } = {}) {
  const byItem = new Map();
  for (const testCase of cases ?? []) {
    if (onlyPassing && testCase.pass !== true) continue;
    for (const item of testCase.compatibilityItems ?? []) {
      if (!item.tapeCovered) continue;
      const record = byItem.get(item.id) ?? {
        id: item.id,
        status: item.status,
        cases: [],
      };
      if (!record.cases.includes(testCase.id)) record.cases.push(testCase.id);
      byItem.set(item.id, record);
    }
  }
  return {
    items: [...byItem.values()].sort((left, right) => left.id.localeCompare(right.id)),
    ids: new Set(byItem.keys()),
  };
}

export function evaluateCoveragePolicy(compatibility, cases) {
  const statusEntries = Object.entries(compatibility.statuses ?? {}).flatMap(([status, items]) =>
    (items ?? []).map((id) => ({ id, status }))
  );
  const statusIds = new Set(statusEntries.map((entry) => entry.id));
  const exactIds = new Set(compatibility.statuses?.exact ?? []);
  const bestEffortIds = new Set(compatibility.statuses?.best_effort ?? []);
  const passingCoverage = summarizeOracleCoverage(cases, { onlyPassing: true });
  const coveredIds = passingCoverage.ids;
  const docCoverage = compatibility.oracleCoverage ?? {};
  const baseline = compatibility.coveragePolicy?.existingClaimBaseline ?? {};
  const baselineExact = new Set(baseline.exact ?? []);
  const baselineBestEffort = new Set(baseline.best_effort ?? []);
  const baselinePromotable = new Set([...baselineExact, ...baselineBestEffort]);

  const missingCoverageDocs = statusEntries
    .filter((entry) => !docCoverage[entry.id])
    .map((entry) => entry.id)
    .sort();
  const staleCoverageDocs = Object.keys(docCoverage)
    .filter((id) => !statusIds.has(id))
    .sort();
  const coveredWithoutPassingCase = Object.entries(docCoverage)
    .filter(([, coverage]) => coverage?.state === "covered")
    .filter(([id]) => !coveredIds.has(id))
    .map(([id]) => id)
    .sort();

  const coveredExactItems = [...exactIds].filter((id) => coveredIds.has(id)).sort();
  const uncoveredExistingExactItems = [...exactIds]
    .filter((id) => !coveredIds.has(id) && baselineExact.has(id))
    .sort();
  const invalidNewExactClaims = [...exactIds]
    .filter((id) => !coveredIds.has(id) && !baselinePromotable.has(id))
    .sort();
  const invalidNewBestEffortClaims = [...bestEffortIds]
    .filter((id) => !coveredIds.has(id) && !baselinePromotable.has(id))
    .sort();

  const failures = [
    ...coveredWithoutPassingCase.map((id) => `docs mark ${id} covered, but no passing oracle case covered it`),
    ...missingCoverageDocs.map((id) => `missing oracleCoverage entry for ${id}`),
    ...invalidNewExactClaims.map((id) => `new/upgraded exact claim lacks passing oracle coverage: ${id}`),
    ...invalidNewBestEffortClaims.map((id) => `new/upgraded best-effort claim lacks passing oracle coverage: ${id}`),
  ];

  return {
    pass: failures.length === 0,
    failures,
    coveredExactItems,
    uncoveredExistingExactItems,
    invalidNewExactClaims,
    invalidNewBestEffortClaims,
    coveredWithoutPassingCase,
    missingCoverageDocs,
    staleCoverageDocs,
    passingCoveredItems: passingCoverage.items,
  };
}

export async function startFixtureServer(root = ORACLE_FIXTURE_ROOT) {
  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const rawPath = decodeURIComponent(requestUrl.pathname === "/" ? "/form.html" : requestUrl.pathname);
      const filePath = resolve(root, `.${rawPath}`);
      if (!filePath.startsWith(resolve(root) + sep) && filePath !== resolve(root)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      if (!existsSync(filePath) || !statSync(filePath).isFile()) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      const ext = extname(filePath).toLowerCase();
      const contentType =
        ext === ".html" ? "text/html; charset=utf-8" : ext === ".json" ? "application/json" : "text/plain";
      response.writeHead(200, { "content-type": contentType });
      response.end(await readFile(filePath));
    } catch (error) {
      response.writeHead(500);
      response.end(String(error));
    }
  });
  await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));
  const address = server.address();
  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise) => server.close(resolvePromise)),
  };
}

export function createRunDir(prefix = "cli") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(ORACLE_RUNS_ROOT, `${stamp}-${prefix}`);
  mkdirSync(runDir, { recursive: true });
  return runDir;
}

export async function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function listFilesSafe(path) {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

export function pathForDisplay(path) {
  return path ? path.replace(REPO_ROOT, ".") : "";
}

export function pathToImport(path) {
  return pathToFileURL(path).href;
}
