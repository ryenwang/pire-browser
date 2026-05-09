import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, writeFile } from "node:fs/promises";
import test from "node:test";
import {
  captureRefsFromText,
  evaluateCoveragePolicy,
  evaluateResultAssertions,
  extractRefs,
  loadCases,
  normalizeOutput,
  readBaselineMetadata,
  readPackageMetadata,
  renderTemplate,
  splitCommand,
  validateBaselineMetadata,
} from "./oracle-lib.mjs";

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function writeTempCases(cases, schemaVersion = 2) {
  const dir = await mkdtemp(join(tmpdir(), "oracle-cases-"));
  const path = join(dir, "cases.json");
  await writeFile(path, JSON.stringify({ schemaVersion, cases }, null, 2));
  return path;
}

function validCase(overrides = {}) {
  return {
    id: "case-one",
    status: "exact",
    fixture: "form.html",
    compatibilityItems: [{ id: "cmd-open", status: "exact", tapeCovered: true }],
    steps: [
      {
        id: "step-one",
        command: "status",
        assertions: [{ type: "exitCodeEquals", value: 0 }],
        captures: [],
      },
    ],
    ...overrides,
  };
}

test("loads tracked oracle cases", async () => {
  const cases = await loadCases();
  assert.ok(cases.length >= 10);
  assert.ok(cases.some((testCase) => testCase.id === "open-fixture"));
  assert.ok(cases.every((testCase) => Array.isArray(testCase.steps)));
});

test("validates tracked oracle baseline metadata", () => {
  const result = validateBaselineMetadata(readBaselineMetadata(), readPackageMetadata());
  assert.equal(result.pass, true, result.failures.join("\n"));
});

test("baseline metadata rejects mismatched pire-browser version", () => {
  const metadata = cloneJson(readBaselineMetadata());
  metadata.pireBrowser.version = "0.0.0";
  const result = validateBaselineMetadata(metadata, readPackageMetadata());
  assert.equal(result.pass, false);
  assert.match(result.failures.join("\n"), /pireBrowser\.version/);
});

test("baseline metadata rejects mismatched agent-browser version and source commit", () => {
  const metadata = cloneJson(readBaselineMetadata());
  metadata.agentBrowser.version = "0.25.0";
  metadata.agentBrowser.sourceCommit = "not-the-pinned-commit";
  const result = validateBaselineMetadata(metadata, readPackageMetadata());
  assert.equal(result.pass, false);
  assert.match(result.failures.join("\n"), /agentBrowser\.version/);
  assert.match(result.failures.join("\n"), /agentBrowser\.sourceCommit/);
});

test("baseline metadata rejects unpinned install command", () => {
  const metadata = cloneJson(readBaselineMetadata());
  metadata.agentBrowser.installCommand = "npm install agent-browser --no-save";
  const result = validateBaselineMetadata(metadata, readPackageMetadata());
  assert.equal(result.pass, false);
  assert.match(result.failures.join("\n"), /installCommand/);
});

test("normalizes legacy v1 cases through v2 step assertions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oracle-v1-"));
  const path = join(dir, "cases.json");
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 1,
      cases: [
        {
          id: "legacy-contains",
          status: "exact",
          command: "snapshot -i",
          compareMode: "contains",
          expectedStdout: ["Submit"],
        },
      ],
    })
  );

  const [testCase] = await loadCases(path);
  assert.equal(testCase.id, "legacy-contains");
  assert.equal(testCase.bail, true);
  assert.deepEqual(testCase.steps[0].assertions, [
    { type: "exitCodeEquals", value: 0 },
    { type: "stdoutContains", value: "Submit" },
  ]);
});

test("normalizes v2 cases to bail by default with an explicit opt-out", async () => {
  const dir = await mkdtemp(join(tmpdir(), "oracle-v2-"));
  const path = join(dir, "cases.json");
  await writeFile(
    path,
    JSON.stringify({
      schemaVersion: 2,
      cases: [
        { id: "default-bail", steps: [{ id: "one", command: "status" }] },
        { id: "no-bail", bail: false, steps: [{ id: "one", command: "status" }] },
      ],
    })
  );

  const cases = await loadCases(path);
  assert.equal(cases[0].bail, true);
  assert.equal(cases[1].bail, false);
});

test("case lint rejects missing fixture files", async () => {
  const path = await writeTempCases([validCase({ fixture: "missing.html" })]);
  await assert.rejects(() => loadCases(path), /fixture does not exist/);
});

test("case lint rejects unknown assertion types", async () => {
  const path = await writeTempCases([
    validCase({
      steps: [{ id: "step-one", command: "status", assertions: [{ type: "notReal" }], captures: [] }],
    }),
  ]);
  await assert.rejects(() => loadCases(path), /unknown assertion type: notReal/);
});

test("case lint rejects DOM assertions without selectors", async () => {
  const path = await writeTempCases([
    validCase({
      steps: [{ id: "step-one", command: "status", assertions: [{ type: "domText", value: "Submit" }], captures: [] }],
    }),
  ]);
  await assert.rejects(() => loadCases(path), /domText needs selector/);
});

test("case lint rejects contains assertions without value or text", async () => {
  const path = await writeTempCases([
    validCase({
      steps: [{ id: "step-one", command: "status", assertions: [{ type: "stdoutContains" }], captures: [] }],
    }),
  ]);
  await assert.rejects(() => loadCases(path), /stdoutContains needs value or text/);
});

test("case lint rejects invalid assertion tools", async () => {
  const path = await writeTempCases([
    validCase({
      steps: [{ id: "step-one", command: "status", assertions: [{ type: "exitCodeNonZero", tool: "chrome" }], captures: [] }],
    }),
  ]);
  await assert.rejects(() => loadCases(path), /invalid tool: chrome/);
});

test("case lint rejects duplicate capture names within a step", async () => {
  const path = await writeTempCases([
    validCase({
      steps: [
        {
          id: "step-one",
          command: "snapshot -i",
          assertions: [{ type: "exitCodeEquals", value: 0 }],
          captures: [
            { name: "email", lineIncludes: ["Email"] },
            { name: "email", regex: "(@e\\d+)" },
          ],
        },
      ],
    }),
  ]);
  await assert.rejects(() => loadCases(path), /Duplicate capture name/);
});

test("splits quoted commands", () => {
  assert.deepEqual(splitCommand('fill "#email" "a b@example.com"'), [
    "fill",
    "#email",
    "a b@example.com",
  ]);
});

test("renders nested template values", () => {
  assert.equal(
    renderTemplate("fill {{refs.email}} {{value}}", {
      refs: { email: "@e4" },
      value: "hello",
    }),
    "fill @e4 hello"
  );
});

test("normalizes dynamic browser output", () => {
  assert.equal(
    normalizeOutput('t12 @e44 ref=e2 Chrome 127.0.0.1:8765 C:\\Users\\wangr\\x 123ms'),
    "tTAB @REF ref=@REF <BROWSER> 127.0.0.1:PORT <PATH> <MS>"
  );
});

test("extracts common refs from snapshots", () => {
  const refs = extractRefs('- textbox "Email" [ref=e1]\n@e2 button "Submit"\n@e3 textbox "Write notes"');
  assert.equal(refs.email, "@e1");
  assert.equal(refs.submit, "@e2");
  assert.equal(refs.notes, "@e3");
});

test("captures declared semantic refs from stdout", () => {
  const refs = captureRefsFromText('@e7 textbox "Email"\n@e9 button "Submit"', [
    { name: "emailInput", lineIncludes: ["Email"] },
    { name: "submitButton", lineIncludes: ["Submit"] },
  ]);
  assert.deepEqual(refs, {
    emailInput: "@e7",
    submitButton: "@e9",
  });
});

test("captures declared text values from stdout", () => {
  const refs = captureRefsFromText("second [t12] ready", [
    { name: "tab", regex: "\\[(t\\d+)\\]", kind: "text" },
  ]);
  assert.deepEqual(refs, {
    tab: "t12",
  });
});

test("evaluates contains assertions", () => {
  const results = evaluateResultAssertions(
    [
      { type: "exitCodeEquals", value: 0 },
      { type: "stdoutContains", value: "@REF" },
      { type: "stdoutContains", value: "Submit" },
    ],
    { stdout: '@e1 button "Submit"', stderr: "", exitCode: 0 },
    { stdout: '@e4 button "Submit"', stderr: "", exitCode: 0 }
  );
  assert.deepEqual(results.map((result) => result.pass), [true, true, true]);
});

test("evaluates error parity assertions", () => {
  const [result] = evaluateResultAssertions(
    [{ type: "stderrNormalizedContains", value: "ref_stale", tool: "pire-browser" }],
    { stdout: "", stderr: "", exitCode: 0 },
    { stdout: "", stderr: "ref_stale: @e1 is gone", exitCode: 1 }
  );
  assert.equal(result.pass, true);
});

test("evaluates stable not available failures", () => {
  const [result] = evaluateResultAssertions(
    [{ type: "notAvailableError", tool: "pire-browser" }],
    { stdout: "stream ok", stderr: "", exitCode: 0 },
    { stdout: "", stderr: "NotAvailableError: not implemented", exitCode: 78 }
  );
  assert.equal(result.pass, true);
});

test("evaluates structured best-effort warning envelopes", () => {
  const [result] = evaluateResultAssertions(
    [{ type: "bestEffortWarning", tool: "pire-browser" }],
    { stdout: "", stderr: "", exitCode: 0 },
    {
      stdout: JSON.stringify({
        success: true,
        data: { text: "ok" },
        warnings: [
          {
            code: "BEST_EFFORT_FIREFOX_GAP",
            feature: "hover",
            message: "Hover is best-effort on Firefox.",
          },
        ],
      }),
      stderr: "",
      exitCode: 0,
    }
  );
  assert.equal(result.pass, true);
});

test("evaluates strict JSON success envelope assertions", () => {
  const [result] = evaluateResultAssertions(
    [
      {
        type: "jsonEnvelopeShape",
        tool: "pire-browser",
        success: true,
        dataPaths: ["text"],
        warningCodes: ["IGNORED_GLOBAL_FLAG"],
      },
    ],
    { stdout: "", stderr: "", exitCode: 0 },
    {
      stdout: JSON.stringify({
        success: true,
        data: { text: "ok" },
        warnings: [
          {
            code: "IGNORED_GLOBAL_FLAG",
            feature: "--headless",
            message: "--headless is not applied.",
          },
        ],
      }),
      stderr: "",
      exitCode: 0,
    }
  );
  assert.equal(result.pass, true, result.reason);
});

test("evaluates strict JSON error envelope assertions", () => {
  const [result] = evaluateResultAssertions(
    [{ type: "jsonEnvelopeShape", tool: "pire-browser", success: false, errorCode: "NotAvailableError" }],
    { stdout: "", stderr: "", exitCode: 0 },
    {
      stdout: JSON.stringify({
        success: false,
        error: {
          code: "NotAvailableError",
          message: "not available",
          data: { compatibility: "not_available" },
        },
        warnings: [],
      }),
      stderr: "",
      exitCode: 78,
    }
  );
  assert.equal(result.pass, true, result.reason);
});

test("evaluates nonzero and output assertions", () => {
  const results = evaluateResultAssertions(
    [
      { type: "exitCodeNonZero" },
      { type: "outputContains", value: "ambiguous_locator", tool: "pire-browser" },
    ],
    { stdout: "", stderr: "strict mode violation", exitCode: 1 },
    { stdout: "", stderr: "ambiguous_locator: 2 elements match", exitCode: 44 }
  );
  assert.deepEqual(results.map((result) => result.pass), [true, true]);
});

test("coverage policy grandfathers existing exact claims but gates new ones", () => {
  const compatibility = {
    statuses: {
      exact: ["open <url>", "future exact"],
      best_effort: [],
      not_available: [],
    },
    oracleCoverage: {
      "open <url>": { state: "covered", tapeCovered: true, cases: ["open-fixture"] },
      "future exact": { state: "uncovered", tapeCovered: false, reason: "new claim under test" },
    },
  };
  const policy = evaluateCoveragePolicy(compatibility, [
    {
      id: "open-fixture",
      pass: true,
      compatibilityItems: [{ id: "open <url>", status: "exact", tapeCovered: true }],
    },
  ], {
    exact: ["open <url>"],
    best_effort: [],
  });
  assert.equal(policy.pass, false);
  assert.deepEqual(policy.coveredExactItems, ["open <url>"]);
  assert.deepEqual(policy.invalidNewExactClaims, ["future exact"]);
});

test("coverage policy accepts canonical doc row coverage", () => {
  const compatibility = {
    schemaVersion: 3,
    items: [
      {
        id: "cmd-open",
        status: "exact",
        coverage: { state: "covered", tapeCovered: true, cases: ["open-fixture"] },
      },
      {
        id: "doc-open",
        status: "exact",
        canonicalItemId: "cmd-open",
        coverage: { state: "covered", tapeCovered: false, cases: [] },
      },
    ],
  };
  const policy = evaluateCoveragePolicy(
    compatibility,
    [
      {
        id: "open-fixture",
        pass: true,
        compatibilityItems: [{ id: "cmd-open", status: "exact", tapeCovered: true }],
      },
    ],
    { exact: [], best_effort: [] }
  );
  assert.equal(policy.pass, true);
  assert.deepEqual(policy.coveredByCanonicalItems.map((item) => item.id), ["doc-open"]);
  assert.deepEqual(policy.invalidNewExactClaims, []);
});
