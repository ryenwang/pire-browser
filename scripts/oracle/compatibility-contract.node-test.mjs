import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AGENT_BROWSER_DOCS_ROOT,
  readBaselineMetadata,
  loadCases,
  loadCompatibility,
  loadCompatibilityBaseline,
  loadDocsManifest,
  loadUnsupportedRoots,
} from "./oracle-lib.mjs";
import {
  CONTRACT_DOC_FILES,
  buildDocsManifest,
  compatibilityItems,
  canonicalLinkCandidateRecords,
  documentedItemKey,
  githubHeadingAnchor,
  loadDocumentedChecklistItems,
  reviewQueueSummary,
  unsupportedRootProvenance,
  validateCompatibilityContract,
} from "./compatibility-contract.mjs";

test("tracked compatibility matrix satisfies the v3 contract", async () => {
  const compatibility = await loadCompatibility();
  const cases = await loadCases();
  const result = validateCompatibilityContract(compatibility, {
    cases,
    docsRoot: AGENT_BROWSER_DOCS_ROOT,
    baseline: readBaselineMetadata(),
    compatibilityBaseline: await loadCompatibilityBaseline(),
    unsupportedRoots: await loadUnsupportedRoots(),
    docsManifest: await loadDocsManifest(),
  });
  assert.equal(result.pass, true, result.failures.join("\n"));
  assert.ok(result.stats.items >= 700);
  assert.ok(compatibility.items.every((item) => !item.id.startsWith("doc-changelog-")));
  assert.ok(result.stats.statuses.exact >= 1);
  assert.ok(result.stats.coverageStates.covered >= 1);
});

test("tracked compatibility matrix defines Epic 2 readiness policies", async () => {
  const compatibility = await loadCompatibility();
  const cases = await loadCases();
  assert.equal(compatibility.globalFlagPolicy["--headless"].behavior, "ignored_with_warning");
  assert.equal(compatibility.globalFlagPolicy["--headless"].warningCode, "IGNORED_GLOBAL_FLAG");
  assert.equal(compatibility.globalFlagPolicy["--color-scheme"].behavior, "ignored_with_warning");
  assert.equal(compatibility.coveragePolicy.epic2Readiness.strictJsonAssertion, "jsonEnvelopeShape");
  for (const caseId of Object.values(compatibility.coveragePolicy.epic2Readiness.negativePathCases)) {
    assert.ok(cases.some((testCase) => testCase.id === caseId), caseId);
  }
});

test("rejects ambiguous global flag and Epic 2 readiness policy", () => {
  const compatibility = baseCompatibility([
    baseItem("doc-flag", {
      source: { kind: "docs", flags: ["--headless"] },
    }),
    baseItem("doc-upload", {
      command: { primary: "upload" },
      ownerEpic: "Epic 5",
      disposition: "not_started",
    }),
    baseItem("doc-networkidle", {
      ownerEpic: "Epic 2",
      source: { kind: "docs", checklist: "`agent-browser wait --load networkidle`" },
    }),
  ]);
  compatibility.globalFlagPolicy = {
    "--headless": { behavior: "ignored_with_warning", warningCode: "WRONG" },
  };
  compatibility.coveragePolicy.epic2Readiness = {
    strictJsonCases: { success: "missing" },
    negativePathCases: {
      bad_selector: "missing",
      stale_ref: "missing",
      ambiguous_selector: "missing",
      disabled_target: "missing",
      short_timeout: "missing",
    },
  };
  const result = validateCompatibilityContract(compatibility, {
    cases: [],
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes("warningCode IGNORED_GLOBAL_FLAG")));
  assert.ok(result.failures.some((failure) => failure.includes("upload compatibility item doc-upload must be owned by Epic 8")));
  assert.ok(result.failures.some((failure) => failure.includes("network-idle compatibility item doc-networkidle must be owned by Epic 5")));
  assert.ok(result.failures.some((failure) => failure.includes("negative-path case bad_selector references unknown case missing")));
  assert.ok(result.failures.some((failure) => failure.includes("strict JSON success case references unknown case missing")));
});

test("mirrored docs expose stable checklist keys", async () => {
  const documented = await loadDocumentedChecklistItems(AGENT_BROWSER_DOCS_ROOT);
  assert.ok(documented.some((item) => item.checklist.includes("`agent-browser open <url>`")));
  assert.ok(documented.every((item) => item.path !== "26-changelog.md"));
  assert.ok(documented.every((item) => documentedItemKey(item).includes("#")));
});

test("source audit rejects unknown contract docs and excluded generated rows", async () => {
  const dir = await mkdtemp(join(tmpdir(), "compat-docs-"));
  await writeContractDocs(dir);
  await writeFile(join(dir, "26-changelog.md"), "# Changelog\n");
  await writeFile(join(dir, "27-future.md"), "# Future\n");

  const unknownFileResult = validateCompatibilityContract(baseCompatibility([]), {
    docsRoot: dir,
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(unknownFileResult.pass, false);
  assert.ok(unknownFileResult.failures.some((failure) => failure.includes("27-future.md")));

  const excludedRowResult = validateCompatibilityContract(
    baseCompatibility([
      {
        ...baseItem("doc-changelog-test"),
        id: "doc-release-note",
        source: { kind: "docs", path: "26-changelog.md", heading: "Changelog", anchor: "changelog", checklist: "release note" },
      },
    ]),
    {
      docsRoot: dir,
      baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
      compatibilityBaseline: { exact: [], best_effort: [] },
    }
  );
  assert.equal(excludedRowResult.pass, false);
  assert.ok(excludedRowResult.failures.some((failure) => failure.includes("excluded contract doc")));
});

test("validates docs manifest fingerprints for contract docs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "compat-docs-manifest-"));
  await writeContractDocs(dir);
  await writeFile(join(dir, "26-changelog.md"), "# Changelog\n");
  const compatibility = baseCompatibility([]);
  const manifest = buildDocsManifest(compatibility, { docsRoot: dir });

  const valid = validateCompatibilityContract(compatibility, {
    docsRoot: dir,
    docsManifest: manifest,
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(valid.pass, true, valid.failures.join("\n"));

  const stale = structuredClone(manifest);
  stale.files[0].sha256 = "bad";
  const staleResult = validateCompatibilityContract(compatibility, {
    docsRoot: dir,
    docsManifest: stale,
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(staleResult.pass, false);
  assert.ok(staleResult.failures.some((failure) => failure.includes("hash is stale")));

  const omitted = { ...manifest, files: manifest.files.slice(1) };
  const omittedResult = validateCompatibilityContract(compatibility, {
    docsRoot: dir,
    docsManifest: omitted,
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(omittedResult.pass, false);
  assert.ok(omittedResult.failures.some((failure) => failure.includes("missing contract doc")));

  const includesExcluded = {
    ...manifest,
    files: [...manifest.files, { path: "26-changelog.md", sha256: "abc", normalizedBytes: 1 }],
  };
  const excludedResult = validateCompatibilityContract(compatibility, {
    docsRoot: dir,
    docsManifest: includesExcluded,
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(excludedResult.pass, false);
  assert.ok(excludedResult.failures.some((failure) => failure.includes("must not include excluded doc")));
});

test("builds deterministic LF-normalized docs manifests", async () => {
  const crlfDir = await mkdtemp(join(tmpdir(), "compat-docs-crlf-"));
  const lfDir = await mkdtemp(join(tmpdir(), "compat-docs-lf-"));
  await writeContractDocs(crlfDir, { "01-introduction.md": "# Intro\r\n\r\n- [ ] `agent-browser open`\r\n" });
  await writeContractDocs(lfDir, { "01-introduction.md": "# Intro\n\n- [ ] `agent-browser open`\n" });
  const compatibility = baseCompatibility([]);
  const crlfManifest = buildDocsManifest(compatibility, { docsRoot: crlfDir });
  const lfManifest = buildDocsManifest(compatibility, { docsRoot: lfDir });

  assert.deepEqual(
    crlfManifest.files.map((file) => file.path),
    [...CONTRACT_DOC_FILES].sort()
  );
  assert.equal(crlfManifest.source.package, "agent-browser");
  assert.equal(crlfManifest.source.version, "0.26.0");
  assert.equal(crlfManifest.source.sourceCommit, "abc");
  assert.equal(crlfManifest.files[0].sha256, lfManifest.files[0].sha256);
  assert.equal(crlfManifest.files[0].normalizedBytes, lfManifest.files[0].normalizedBytes);
});

test("validates source pins, ids, aliases, and fixture references", () => {
  const compatibility = {
    schemaVersion: 3,
    source: {
      package: "agent-browser",
      version: "0.26.0",
      sourceCommit: "7ada3384e2afb5f3c43d9106389da86d8f807dca",
      capturedAt: "2026-05-06",
      refreshProcess: "refresh",
    },
    items: [
      {
        id: "cmd-open-url",
        status: "exact",
        disposition: "temporary_gap",
        contractReviewed: true,
        ownerEpic: "Epic 2",
        rationale: "Reviewed synthetic exact command contract for parser alias coverage.",
        source: { kind: "synthetic" },
        aliases: [{ name: "goto", parserCovered: true, cases: ["open-fixture"] }],
        contracts: {
          text: "Synthetic normalized text contract for alias validation.",
          json: "Synthetic JSON envelope contract for alias validation.",
          exitCode: [0],
          errorName: null,
          warningsContractual: false,
        },
        coverage: { state: "covered", tapeCovered: true, cases: ["open-fixture"] },
      },
    ],
    coveragePolicy: {
      existingClaimBaselinePath: "docs/agent-browser-compatibility-baseline.json",
    },
  };
  const result = validateCompatibilityContract(compatibility, {
    cases: [
      {
        id: "open-fixture",
        compatibilityItems: [{ id: "cmd-open-url" }],
        steps: [{ id: "alias", command: "goto https://example.com", assertions: [] }],
      },
    ],
    baseline: {
      agentBrowser: {
        version: "0.26.0",
        sourceCommit: "7ada3384e2afb5f3c43d9106389da86d8f807dca",
      },
    },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(result.pass, true, result.failures.join("\n"));
});

test("validates ownerEpic against the Epic 1 through Epic 8 allowlist", () => {
  const invalid = validateCompatibilityContract(baseCompatibility([baseItem("cmd-invalid-epic", { ownerEpic: "Epic X" })]), {
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(invalid.pass, false);
  assert.ok(invalid.failures.some((failure) => failure.includes("ownerEpic for cmd-invalid-epic must be one of")));

  const missing = validateCompatibilityContract(baseCompatibility([baseItem("cmd-missing-epic", { ownerEpic: undefined })]), {
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(missing.pass, false);
  assert.ok(missing.failures.some((failure) => failure.includes("ownerEpic is required for cmd-missing-epic")));
});

test("validates canonical roll-up links", () => {
  const compatibility = {
    schemaVersion: 3,
    source: {
      package: "agent-browser",
      version: "0.26.0",
      sourceCommit: "abc",
      capturedAt: "2026-05-06",
      refreshProcess: "refresh",
    },
    coveragePolicy: {
      existingClaimBaselinePath: "docs/agent-browser-compatibility-baseline.json",
    },
    items: [
      {
        id: "cmd-open",
        status: "exact",
        disposition: "temporary_gap",
        contractReviewed: true,
        ownerEpic: "Epic 2",
        rationale: "Reviewed canonical command contract.",
        source: { kind: "synthetic" },
        command: { primary: "open" },
        aliases: [{ name: "goto", parserCovered: false, cases: [] }],
        contracts: { text: "Canonical text contract.", json: "Canonical JSON contract.", exitCode: [0], errorName: null, warningsContractual: false },
        coverage: { state: "covered", tapeCovered: true, cases: ["open-fixture"] },
      },
      {
        id: "doc-open",
        status: "exact",
        disposition: "temporary_gap",
        contractReviewed: true,
        ownerEpic: "Epic 2",
        rationale: "Reviewed duplicate documentation surface.",
        source: { kind: "synthetic" },
        command: { primary: "goto" },
        canonicalItemId: "cmd-open",
        contracts: { text: "Canonical duplicate text contract.", json: "Canonical duplicate JSON contract.", exitCode: [0], errorName: null, warningsContractual: false },
        coverage: { state: "covered", tapeCovered: false, cases: [] },
      },
    ],
  };
  const result = validateCompatibilityContract(compatibility, {
    cases: [
      {
        id: "open-fixture",
        compatibilityItems: [{ id: "cmd-open", tapeCovered: true }],
        steps: [{ id: "open", command: "open https://example.com", assertions: [] }],
      },
    ],
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(result.pass, true, result.failures.join("\n"));
});

test("suggests only safe canonical link candidates", () => {
  const items = [
    {
      ...baseItem("cmd-open"),
      id: "cmd-open",
      command: { primary: "open" },
      aliases: [{ name: "goto", parserCovered: true, cases: ["open-fixture"] }],
      coverage: { state: "covered", tapeCovered: true, cases: ["open-fixture"] },
    },
    {
      ...baseItem("doc-goto"),
      id: "doc-goto",
      command: { primary: "goto" },
      source: { kind: "docs", path: "05-commands.md", checklist: "`agent-browser goto <url>`" },
      coverage: { state: "uncovered", tapeCovered: false, cases: [] },
    },
    {
      ...baseItem("doc-open-pipeline"),
      id: "doc-open-pipeline",
      command: { primary: "open" },
      source: { kind: "docs", path: "05-commands.md", checklist: "`agent-browser open` | `agent-browser snapshot`" },
      coverage: { state: "uncovered", tapeCovered: false, cases: [] },
    },
    {
      ...baseItem("doc-click"),
      id: "doc-click",
      command: { primary: "click" },
      source: { kind: "docs", path: "05-commands.md", checklist: "`agent-browser click`" },
      coverage: { state: "uncovered", tapeCovered: false, cases: [] },
    },
  ];
  assert.deepEqual(canonicalLinkCandidateRecords(items), [
    {
      id: "doc-goto",
      canonicalItemId: "cmd-open",
      commandRoot: "goto",
      status: "exact",
      ownerEpic: "Epic 2",
      sourcePath: "05-commands.md",
    },
  ]);
});

test("rejects broken canonical links and unsupported root provenance", () => {
  const compatibility = {
    schemaVersion: 3,
    source: {
      package: "agent-browser",
      version: "0.26.0",
      sourceCommit: "abc",
      capturedAt: "2026-05-06",
      refreshProcess: "refresh",
    },
    coveragePolicy: {
      existingClaimBaselinePath: "docs/agent-browser-compatibility-baseline.json",
    },
    items: [
      {
        id: "cmd-open",
        status: "exact",
        disposition: "temporary_gap",
        contractReviewed: true,
        ownerEpic: "Epic 2",
        rationale: "Reviewed canonical command contract.",
        source: { kind: "synthetic" },
        command: { primary: "open" },
        canonicalItemId: "doc-open",
        contracts: { text: "Canonical text contract.", json: "Canonical JSON contract.", exitCode: [0], errorName: null, warningsContractual: false },
        coverage: { state: "covered", tapeCovered: true, cases: ["open-fixture"] },
      },
      {
        id: "doc-open",
        status: "exact",
        disposition: "temporary_gap",
        contractReviewed: true,
        ownerEpic: "Epic 2",
        rationale: "Reviewed duplicate documentation surface.",
        source: { kind: "synthetic" },
        command: { primary: "click" },
        canonicalItemId: "cmd-open",
        contracts: { text: "Canonical duplicate text contract.", json: "Canonical duplicate JSON contract.", exitCode: [0], errorName: null, warningsContractual: false },
        coverage: { state: "covered", tapeCovered: false, cases: [] },
      },
    ],
  };
  const result = validateCompatibilityContract(compatibility, {
    cases: [
      {
        id: "open-fixture",
        compatibilityItems: [{ id: "cmd-open", tapeCovered: true }],
        steps: [{ id: "open", command: "open https://example.com", assertions: [] }],
      },
    ],
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
    unsupportedRoots: { schemaVersion: 2, unsupportedRoots: ["open"], roots: [{ root: "open", itemIds: ["missing"] }] },
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes("canonicalItemId is only allowed on doc rows")));
  assert.ok(result.failures.some((failure) => failure.includes("command root is not compatible")));
  assert.ok(result.failures.some((failure) => failure.includes("supported root must not be marked unsupported")));
});

test("summarizes review queue and unsupported provenance", () => {
  const items = [
    {
      id: "doc-a",
      status: "exact",
      disposition: "temporary_gap",
      contractReviewed: false,
      ownerEpic: "Epic 2",
      runtime: { unsupportedRoots: ["stream"] },
      source: { path: "05-commands.md" },
    },
    {
      id: "doc-b",
      status: "not_available",
      disposition: "backend_specific",
      contractReviewed: false,
      ownerEpic: "Epic 8",
      runtime: { unsupportedRoots: ["stream"] },
      source: { path: "12-cdp-mode.md" },
    },
  ];
  assert.deepEqual(reviewQueueSummary(items).map((group) => [group.ownerEpic, group.status, group.count]), [
    ["Epic 2", "exact", 1],
    ["Epic 8", "not_available", 1],
  ]);
  assert.deepEqual(unsupportedRootProvenance(items), [
    {
      root: "stream",
      itemIds: ["doc-a", "doc-b"],
      ownerEpics: ["Epic 2", "Epic 8"],
      dispositions: ["backend_specific", "temporary_gap"],
      sourcePaths: ["05-commands.md", "12-cdp-mode.md"],
    },
  ]);
});

test("rejects unknown fixture compatibility ids", () => {
  const compatibility = {
    schemaVersion: 3,
    source: {
      package: "agent-browser",
      version: "0.26.0",
      sourceCommit: "abc",
    capturedAt: "2026-05-06",
      refreshProcess: "refresh",
    },
    items: [],
    coveragePolicy: {
      existingClaimBaselinePath: "docs/agent-browser-compatibility-baseline.json",
    },
  };
  const result = validateCompatibilityContract(compatibility, {
    cases: [{ id: "case", compatibilityItems: [{ id: "missing" }] }],
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.includes("unknown compatibility item id")));
});

test("source anchors resolve against headings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "compat-docs-"));
  await writeFile(join(dir, "sample.md"), "# Commands\n\n- [ ] `agent-browser open`\n");
  const compatibility = {
    schemaVersion: 3,
    source: {
      package: "agent-browser",
      version: "0.26.0",
      sourceCommit: "abc",
      capturedAt: "2026-05-06",
      refreshProcess: "refresh",
    },
    items: [
      {
        id: "cmd-open",
        status: "not_available",
        disposition: "not_started",
        contractReviewed: false,
        ownerEpic: "Epic 2",
        rationale: "test",
        source: {
          kind: "docs",
          path: "sample.md",
          heading: "Commands",
          anchor: githubHeadingAnchor("Commands"),
          checklist: "`agent-browser open`",
        },
        contracts: {
          text: "not_available",
          json: "error envelope",
          exitCode: [78],
          errorName: "NotAvailableError",
          warningsContractual: false,
        },
        coverage: { state: "uncovered", tapeCovered: false, cases: [] },
        limitations: ["test"],
      },
    ],
    coveragePolicy: {
      existingClaimBaselinePath: "docs/agent-browser-compatibility-baseline.json",
    },
  };
  const result = validateCompatibilityContract(compatibility, {
    docsRoot: dir,
    baseline: { agentBrowser: { version: "0.26.0", sourceCommit: "abc" } },
    compatibilityBaseline: { exact: [], best_effort: [] },
  });
  assert.equal(result.pass, true, result.failures.join("\n"));
});

test("v3 matrix exposes compatibility item records", async () => {
  const compatibility = await loadCompatibility();
  const items = compatibilityItems(compatibility);
  assert.ok(items.some((item) => item.id === "cmd-open"));
  assert.ok(items.some((item) => item.id === "cmd-stream"));
});

async function writeContractDocs(dir, overrides = {}) {
  await Promise.all(CONTRACT_DOC_FILES.map((file) => writeFile(join(dir, file), overrides[file] ?? `# ${file}\n`)));
}

function baseCompatibility(items) {
  return {
    schemaVersion: 3,
    source: {
      package: "agent-browser",
      version: "0.26.0",
      sourceCommit: "abc",
      capturedAt: "2026-05-06",
      refreshProcess: "refresh",
    },
    items,
    coveragePolicy: {
      existingClaimBaselinePath: "docs/agent-browser-compatibility-baseline.json",
    },
  };
}

function baseItem(id, overrides = {}) {
  return {
    id,
    status: "exact",
    disposition: "temporary_gap",
    contractReviewed: true,
    ownerEpic: "Epic 2",
    rationale: `Reviewed synthetic compatibility contract for ${id}.`,
    source: { kind: "synthetic" },
    command: { primary: "open" },
    contracts: {
      text: `Reviewed text contract for ${id}.`,
      json: `Reviewed JSON contract for ${id}.`,
      exitCode: [0],
      errorName: null,
      warningsContractual: false,
    },
    coverage: { state: "covered", tapeCovered: true, cases: ["case"] },
    ...overrides,
  };
}
