import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPATIBILITY_BASELINE_PATH, REPO_ROOT } from "./oracle-lib.mjs";
import { readJsonFromGitRef, resolveCompatibilityComparisonRef } from "./git-compare.mjs";

const BASELINE_GIT_PATH = "docs/agent-browser-compatibility-baseline.json";

export function baselineAdditions(current, previous) {
  const additions = {};
  for (const status of ["exact", "best_effort"]) {
    const previousIds = new Set(previous?.[status] ?? []);
    additions[status] = [...new Set(current?.[status] ?? [])].filter((id) => !previousIds.has(id)).sort();
  }
  return additions;
}

export function hasBaselineAdditions(additions) {
  return Object.values(additions).some((ids) => ids.length > 0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const current = JSON.parse(readFileSync(COMPATIBILITY_BASELINE_PATH, "utf8"));
  const comparison = resolveCompatibilityComparisonRef();
  const previousResult = readJsonFromGitRef(comparison.ref, BASELINE_GIT_PATH);
  if (!previousResult.found) {
    console.log(
      `Compatibility baseline is new relative to ${comparison.ref}; skipping no-additions guard for initial introduction.`
    );
    process.exit(0);
  }

  const additions = baselineAdditions(current, previousResult.value);
  if (hasBaselineAdditions(additions)) {
    console.error(`Compatibility baseline gained ids in ${relative(REPO_ROOT, COMPATIBILITY_BASELINE_PATH)}:`);
    for (const [status, ids] of Object.entries(additions)) {
      for (const id of ids) console.error(`- ${status}: ${id}`);
    }
    process.exit(1);
  }
  console.log("Compatibility baseline has no new legacy allowances.");
}
