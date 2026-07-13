import assert from "node:assert/strict";
import { test } from "node:test";
import { CASES } from "./lib/cases.mjs";
import { DEFAULT_OPTIONS, parseArgs } from "./lib/options.mjs";
import { buildPrompt } from "./lib/prompt.mjs";
import { EvalError, redactSecrets, runProvider } from "./lib/provider.mjs";
import { REPORT_SCHEMA } from "./lib/report.mjs";
import { filterCases, scoreResponse } from "./lib/scoring.mjs";
import { runEvaluation } from "./lib/runner.mjs";

const fakeSkill = "name: pire-browser\nUse pire-browser skills get core before browser commands.";

function fakeResponse(text) {
  return async ({ provider, prompt }) => ({ provider, text: typeof text === "function" ? text(prompt) : text });
}

test("scores expected, ordered, and forbidden patterns", () => {
  const result = scoreResponse(
    "pire-browser skills get core\npire-browser snapshot\npire-browser fill '@e1' \"a\"\npire-browser snapshot",
    {
      expected: [{ id: "skill", pattern: /skills get core/ }, { id: "fill", pattern: /fill/ }],
      ordered: [{ id: "fresh", patterns: [/snapshot/, /fill/, /snapshot/] }],
      forbidden: [{ id: "stale", pattern: /use the old ref/i }],
    },
  );
  assert.equal(result.passed, true);
  assert.equal(result.score, 1);
  assert.deepEqual(result.forbidden.matched, []);
});

test("filters cases by category and id", () => {
  assert.equal(filterCases(CASES, { categories: ["qa"] }).map((item) => item.id).join(","), "canonical-qa-evidence-bundle");
  assert.equal(filterCases(CASES, { caseIds: ["tabs-and-windows"] }).length, 1);
  assert.equal(filterCases(CASES, { categories: ["workflow"], caseIds: ["tabs-and-windows"] }).length, 1);
});

test("parses live-run options without changing defaults", () => {
  const parsed = parseArgs(["--provider", "claude", "--model", "sonnet", "--category", "workflow,qa", "--timeout", "5000", "--json", "--output", "report.json", "--judge", "codex", "--judge-model", "judge", "--judge-timeout", "7000"]);
  assert.deepEqual(parsed.options, {
    provider: "claude",
    model: "sonnet",
    categories: ["workflow", "qa"],
    caseIds: [],
    timeoutMs: 5000,
    json: true,
    output: "report.json",
    judge: "codex",
    judgeModel: "judge",
    judgeTimeoutMs: 7000,
  });
  assert.equal(DEFAULT_OPTIONS.provider, "codex");
  assert.equal(parseArgs(["--provider=codex", "--category=skill,qa"]).options.categories.join(","), "skill,qa");
});

test("runs selected cases with a fake provider and returns the report schema", async () => {
  const response = [
    "pire-browser skills get core",
    "pire-browser open https://example.com",
    "pire-browser snapshot",
    "pire-browser fill '@e1' \"test@example.com\"",
    "pire-browser click '@e2'",
    "pire-browser snapshot",
    "pire-browser get text '#success'",
  ].join("\n");
  const prompts = [];
  const report = await runEvaluation({
    cases: CASES,
    options: { ...DEFAULT_OPTIONS, categories: ["workflow"], caseIds: ["inspect-act-verify-form"] },
    skillText: fakeSkill,
    invokeProvider: async ({ provider, prompt }) => {
      prompts.push(prompt);
      return { provider, text: response };
    },
  });
  assert.equal(report.schema, REPORT_SCHEMA);
  assert.equal(report.summary.total, 1);
  assert.equal(report.cases[0].status, "passed");
  assert.equal(report.cases[0].response.text.includes("pire-browser"), true);
  assert.equal(report.cases[0].error, undefined);
  assert.equal(prompts[0].includes(fakeSkill), true);
});

test("passes the proposed workflow text to an optional judge", async () => {
  const calls = [];
  const report = await runEvaluation({
    cases: CASES,
    options: {
      ...DEFAULT_OPTIONS,
      categories: ["workflow"],
      caseIds: ["inspect-act-verify-form"],
      judge: "claude",
    },
    skillText: fakeSkill,
    invokeProvider: async ({ provider, prompt }) => {
      calls.push({ provider, prompt });
      if (provider === "claude") return { provider, text: '{"score":0.9,"reason":"sound"}' };
      return {
        provider,
        text: "pire-browser snapshot\npire-browser fill '@e1' a\npire-browser click '@e2'\npire-browser snapshot",
      };
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].prompt.includes("pire-browser fill"), true);
  assert.equal(report.cases[0].judge.score, 0.9);
});

test("records provider errors without leaking their message secrets", async () => {
  const report = await runEvaluation({
    cases: [CASES[0]],
    options: { ...DEFAULT_OPTIONS, categories: [] },
    skillText: fakeSkill,
    invokeProvider: async () => {
      throw new EvalError("PROVIDER_CLI_FAILED", "provider failed with AI_GATEWAY_API_KEY=super-secret");
    },
  });
  assert.equal(report.summary.errored, 1);
  assert.equal(report.cases[0].status, "error");
  assert.equal(report.cases[0].error.message.includes("super-secret"), false);
  assert.equal(report.cases[0].error.message.includes("[REDACTED]"), true);
});

test("redacts common standalone secret forms", () => {
  const safe = redactSecrets("token=abc password:xyz Bearer qwerty api-key=def");
  assert.equal(safe.includes("abc"), false);
  assert.equal(safe.includes("xyz"), false);
  assert.equal(safe.includes("qwerty"), false);
  assert.equal(safe.includes("def"), false);
});

test("reports a clear missing-CLI error without requiring a separate API key", async () => {
  let invocation;
  const missingCli = await assert.rejects(
    runProvider({
      provider: "codex",
      prompt: "proposal",
      env: {},
      cwd: "C:\\eval-temp",
      platform: "linux",
      spawnImpl: (command, args, options) => {
        invocation = { command, args, options };
        const child = {
          stdout: { on() {} },
          stderr: { on() {} },
          once(event, callback) {
            if (event === "error") queueMicrotask(() => callback(Object.assign(new Error("not installed"), { code: "ENOENT" })));
          },
          kill() {},
        };
        return child;
      },
    }),
    (error) => error.code === "PROVIDER_CLI_NOT_FOUND",
  );
  assert.equal(missingCli, undefined);
  assert.equal(invocation.command, "codex");
  assert.equal(invocation.options.cwd, "C:\\eval-temp");
  assert.equal(invocation.args.includes("read-only"), true);
  assert.equal(invocation.args.includes("--ephemeral"), true);
});

test("uses the Windows command shim and sends prompts through stdin", async () => {
  let invocation;
  let stdin = "";
  await assert.rejects(
    runProvider({
      provider: "codex",
      prompt: "proposal & keep this out of cmd arguments",
      env: { ComSpec: "C:\\Windows\\System32\\cmd.exe" },
      platform: "win32",
      spawnImpl: (command, args, options) => {
        invocation = { command, args, options };
        return {
          stdin: { end(value) { stdin = value; } },
          stdout: { on() {} },
          stderr: { on() {} },
          once(event, callback) {
            if (event === "error") queueMicrotask(() => callback(Object.assign(new Error("missing"), { code: "ENOENT" })));
          },
          kill() {},
        };
      },
    }),
    (error) => error.code === "PROVIDER_CLI_NOT_FOUND",
  );
  assert.equal(invocation.command.endsWith("cmd.exe"), true);
  assert.deepEqual(invocation.args.slice(0, 4), ["/d", "/s", "/c", "codex.cmd"]);
  assert.equal(invocation.args.includes("proposal & keep this out of cmd arguments"), false);
  assert.equal(stdin, "proposal & keep this out of cmd arguments");
});

test("case rubrics encode the required behaviors and safety boundaries", () => {
  const requiredIds = new Set(CASES.flatMap((item) => item.expected.map((check) => check.id)));
  for (const id of ["load-core-skill", "initial-snapshot", "tab-list", "profile-import", "mcp-pagination"]) {
    assert.equal(requiredIds.has(id), true, "missing rubric check " + id);
  }
  assert.equal(CASES.some((item) => item.forbidden.some((check) => check.id === "stale-ref-reuse")), true);
  assert.equal(CASES.some((item) => item.forbidden.some((check) => check.id === "credential-exposure")), true);
  assert.equal(CASES.some((item) => item.forbidden.some((check) => check.id === "wrong-trace-claim")), true);
  assert.equal(CASES.some((item) => item.ordered.some((check) => check.id === "reverse-order-stop")), true);
});

test("injects the installed skill into every case prompt", () => {
  const prompt = buildPrompt(CASES[0], fakeSkill);
  assert.equal(prompt.includes("BEGIN INJECTED SKILL"), true);
  assert.equal(prompt.includes(fakeSkill), true);
  assert.equal(prompt.includes("Do not execute browser commands"), true);
});
