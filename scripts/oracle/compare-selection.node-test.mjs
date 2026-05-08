import assert from "node:assert/strict";
import test from "node:test";
import { selectOracleCases } from "./compare-selection.mjs";

const cases = [
  { id: "open-fixture", status: "exact", visibleSafe: true },
  { id: "type-selector", status: "exact", visibleSafe: false },
  { id: "bing-open-search-url-visible", status: "smoke", visibleSafe: true },
];

test("compare selection rejects unknown filtered case ids", () => {
  assert.throws(
    () => selectOracleCases(cases, { caseFilterText: "missing-case" }),
    /Unknown oracle case id\(s\): missing-case/
  );
});

test("compare selection rejects visible-only filters for non-visible-safe cases", () => {
  assert.throws(
    () => selectOracleCases(cases, { caseFilterText: "type-selector", visibleOnly: true }),
    /non-visibleSafe case id\(s\): type-selector/
  );
});

test("compare selection accepts comma-separated visible-safe cases", () => {
  const result = selectOracleCases(cases, {
    caseFilterText: "open-fixture,bing-open-search-url-visible",
    visibleOnly: true,
    visibleRun: true,
  });

  assert.deepEqual(result.cases.map((testCase) => testCase.id), [
    "open-fixture",
    "bing-open-search-url-visible",
  ]);
  assert.equal(result.runKind, "visible-compare");
  assert.equal(result.coverageComplete, false);
});

test("compare selection marks unfiltered non-smoke deterministic runs coverage-complete", () => {
  const result = selectOracleCases(cases);
  assert.deepEqual(result.selection.selectedCaseIds, ["open-fixture", "type-selector"]);
  assert.equal(result.coverageComplete, true);
});
