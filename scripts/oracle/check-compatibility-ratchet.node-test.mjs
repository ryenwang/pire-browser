import assert from "node:assert/strict";
import test from "node:test";
import { compatibilityRatchetFailures, hasCompatibilityRatchetFailures } from "./check-compatibility-ratchet.mjs";

test("ratchet skips diff-only checks before schema v3 exists on comparison ref", () => {
  const result = compatibilityRatchetFailures(matrix([item("cmd-open", { status: "exact" })]), { schemaVersion: 2 });
  assert.equal(result.skipped, true);
  assert.equal(hasCompatibilityRatchetFailures(result), false);
});

test("status improvement requires reviewed covered contract", () => {
  const previous = matrix([item("cmd-open", { status: "not_available", contractReviewed: false })]);
  const current = matrix([item("cmd-open", { status: "exact", contractReviewed: false, coverage: uncovered() })]);
  const result = compatibilityRatchetFailures(current, previous);
  assert.equal(hasCompatibilityRatchetFailures(result), true);
  assert.ok(result.failures.some((failure) => failure.includes("contractReviewed=true")));
  assert.ok(result.failures.some((failure) => failure.includes("covered coverage")));
});

test("status improvement can use canonical coverage", () => {
  const previous = matrix([
    item("cmd-open", { status: "exact", coverage: covered() }),
    item("doc-open", { status: "not_available", command: { primary: "open" }, canonicalItemId: "cmd-open", coverage: covered() }),
  ]);
  const current = matrix([
    item("cmd-open", { status: "exact", coverage: covered() }),
    item("doc-open", { status: "exact", command: { primary: "open" }, canonicalItemId: "cmd-open", coverage: covered() }),
  ]);
  const result = compatibilityRatchetFailures(current, previous);
  assert.deepEqual(result.failures, []);
});

test("status downgrade requires review and changed rationale or disposition", () => {
  const previous = matrix([item("cmd-open", { status: "exact", rationale: "Reviewed exact contract." })]);
  const current = matrix([item("cmd-open", { status: "best_effort", rationale: "Reviewed exact contract.", contractReviewed: false })]);
  const result = compatibilityRatchetFailures(current, previous);
  assert.equal(hasCompatibilityRatchetFailures(result), true);
  assert.ok(result.failures.some((failure) => failure.includes("contractReviewed=true")));
  assert.ok(result.failures.some((failure) => failure.includes("changed rationale or disposition")));
});

test("review flips cannot leave boilerplate contract text", () => {
  const previous = matrix([item("cmd-open", { contractReviewed: false })]);
  const current = matrix([
    item("cmd-open", {
      contractReviewed: true,
      contracts: { text: "Semantic parity after documented normalization." },
    }),
  ]);
  const result = compatibilityRatchetFailures(current, previous);
  assert.equal(hasCompatibilityRatchetFailures(result), true);
  assert.ok(result.failures.some((failure) => failure.includes("boilerplate")));
});

function matrix(items) {
  return { schemaVersion: 3, items };
}

function item(id, overrides = {}) {
  return {
    id,
    status: "exact",
    disposition: "temporary_gap",
    contractReviewed: true,
    rationale: "Reviewed compatibility contract.",
    command: { primary: "open" },
    contracts: { text: "Reviewed text contract." },
    coverage: covered(),
    ...overrides,
  };
}

function covered() {
  return { state: "covered", cases: ["case"], tapeCovered: true };
}

function uncovered() {
  return { state: "uncovered", cases: [], tapeCovered: false };
}
