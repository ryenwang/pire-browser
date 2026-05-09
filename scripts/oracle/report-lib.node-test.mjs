import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import test from "node:test";
import { parseReportArgs, reportExitCode, selectReportRun } from "./report-lib.mjs";

const cases = [
  { id: "open-fixture", status: "exact" },
  { id: "type-selector", status: "exact" },
  { id: "bing-open-search-url-visible", status: "smoke" },
];

test("report selection defaults to newest coverage-complete run", async () => {
  const root = await mkdtemp(join(tmpdir(), "oracle-report-"));
  const full = await writeRun(root, "full", {
    finishedAt: "2026-05-08T08:00:00.000Z",
    coverageComplete: true,
    cases: [{ id: "open-fixture" }, { id: "type-selector" }],
  });
  await writeRun(root, "visible", {
    finishedAt: "2026-05-08T09:00:00.000Z",
    coverageComplete: false,
    cases: [{ id: "open-fixture" }],
  });

  assert.equal(await selectReportRun({ runsRoot: root, allCases: cases }), full);
});

test("report selection can inspect latest run including visible subsets", async () => {
  const root = await mkdtemp(join(tmpdir(), "oracle-report-"));
  await writeRun(root, "full", {
    finishedAt: "2026-05-08T08:00:00.000Z",
    coverageComplete: true,
    cases: [{ id: "open-fixture" }, { id: "type-selector" }],
  });
  const visible = await writeRun(root, "visible", {
    finishedAt: "2026-05-08T09:00:00.000Z",
    coverageComplete: false,
    cases: [{ id: "open-fixture" }],
  });

  assert.equal(await selectReportRun({ runsRoot: root, argv: ["--latest-any"], allCases: cases }), visible);
});

test("report selection accepts an explicit run directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "oracle-report-"));
  const full = await writeRun(root, "full", {
    finishedAt: "2026-05-08T08:00:00.000Z",
    coverageComplete: true,
    cases: [{ id: "open-fixture" }, { id: "type-selector" }],
  });
  await writeRun(root, "visible", {
    finishedAt: "2026-05-08T09:00:00.000Z",
    coverageComplete: false,
    cases: [{ id: "open-fixture" }],
  });

  assert.equal(await selectReportRun({ runsRoot: root, argv: ["--run", basename(full)], allCases: cases }), full);
});

test("report selection infers legacy coverage-complete summaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "oracle-report-"));
  const legacyFull = await writeRun(root, "legacy-full", {
    finishedAt: "2026-05-08T08:00:00.000Z",
    cases: [{ id: "open-fixture" }, { id: "type-selector" }],
  });
  await writeRun(root, "visible", {
    finishedAt: "2026-05-08T09:00:00.000Z",
    cases: [{ id: "open-fixture" }],
  });

  assert.equal(await selectReportRun({ runsRoot: root, allCases: cases }), legacyFull);
});

test("report inspection mode does not fail on subset coverage gaps", () => {
  const exitCode = reportExitCode({
    summary: { pass: true, coverageComplete: false, cases: [{ id: "open-fixture" }] },
    coveragePolicy: { pass: false },
    options: parseReportArgs(["--latest-any"]),
    allCases: cases,
  });

  assert.equal(exitCode, 0);
});

test("report can enforce coverage for subset inspection", () => {
  const exitCode = reportExitCode({
    summary: { pass: true, coverageComplete: false, cases: [{ id: "open-fixture" }] },
    coveragePolicy: { pass: false },
    options: parseReportArgs(["--latest-any", "--enforce-coverage"]),
    allCases: cases,
  });

  assert.equal(exitCode, 1);
});

test("report default coverage-complete runs enforce coverage policy", () => {
  const exitCode = reportExitCode({
    summary: {
      pass: true,
      coverageComplete: true,
      cases: [{ id: "open-fixture" }, { id: "type-selector" }],
    },
    coveragePolicy: { pass: false },
    options: parseReportArgs([]),
    allCases: cases,
  });

  assert.equal(exitCode, 1);
});

test("report always fails for failed run summaries", () => {
  const exitCode = reportExitCode({
    summary: { pass: false, coverageComplete: false, cases: [{ id: "open-fixture" }] },
    coveragePolicy: { pass: true },
    options: parseReportArgs(["--run", "visible"]),
    allCases: cases,
  });

  assert.equal(exitCode, 1);
});

test("report args include review queue and unsupported root modes", () => {
  const options = parseReportArgs(["--review-queue", "--unsupported-roots", "--json"]);
  assert.equal(options.reviewQueue, true);
  assert.equal(options.unsupportedRoots, true);
  assert.equal(options.json, true);
});

async function writeRun(root, name, summary) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  return dir;
}
