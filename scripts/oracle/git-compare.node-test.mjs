import assert from "node:assert/strict";
import test from "node:test";
import {
  isInitialSchemaV3Comparison,
  readJsonFromGitRef,
  resolveCompatibilityComparisonRef,
} from "./git-compare.mjs";

test("comparison ref honors explicit oracle base ref", () => {
  const resolved = resolveCompatibilityComparisonRef({
    env: { ORACLE_COMPATIBILITY_BASE_REF: "main" },
    execFileSyncImpl: unreachableExec,
  });
  assert.deepEqual(resolved, { ref: "main", source: "ORACLE_COMPATIBILITY_BASE_REF" });
});

test("comparison ref uses origin github base when it exists", () => {
  const resolved = resolveCompatibilityComparisonRef({
    env: { GITHUB_BASE_REF: "main" },
    execFileSyncImpl: fakeExec({ existingRefs: ["origin/main"] }),
  });
  assert.deepEqual(resolved, { ref: "origin/main", source: "GITHUB_BASE_REF" });
});

test("comparison ref falls back to HEAD when github base is unavailable", () => {
  const resolved = resolveCompatibilityComparisonRef({
    env: { GITHUB_BASE_REF: "main" },
    execFileSyncImpl: fakeExec({ existingRefs: [] }),
  });
  assert.deepEqual(resolved, { ref: "HEAD", source: "HEAD" });
});

test("git JSON reader reports missing or malformed files without throwing", () => {
  const missing = readJsonFromGitRef("HEAD", "missing.json", { execFileSyncImpl: fakeExec({}) });
  assert.equal(missing.found, false);

  const malformed = readJsonFromGitRef("HEAD", "bad.json", {
    execFileSyncImpl: () => "{",
  });
  assert.equal(malformed.found, false);
});

test("initial schema v3 comparison recognizes missing and pre-v3 baselines", () => {
  assert.equal(isInitialSchemaV3Comparison({ found: false }), true);
  assert.equal(isInitialSchemaV3Comparison({ found: true, value: { schemaVersion: 2 } }), true);
  assert.equal(isInitialSchemaV3Comparison({ found: true, value: { schemaVersion: 3 } }), false);
});

function fakeExec({ existingRefs = [], files = {} } = {}) {
  return (_command, args) => {
    if (args[0] === "rev-parse") {
      const ref = String(args[2]).replace(/\^\{commit\}$/, "");
      if (existingRefs.includes(ref)) return `${ref}\n`;
      throw new Error("missing ref");
    }
    if (args[0] === "show") {
      const spec = args[1];
      if (Object.hasOwn(files, spec)) return files[spec];
      throw new Error("missing file");
    }
    throw new Error(`unexpected git command: ${args.join(" ")}`);
  };
}

function unreachableExec() {
  throw new Error("should not execute git");
}
