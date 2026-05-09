import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COMPATIBILITY_PATH } from "./oracle-lib.mjs";
import { compatibilityItems, hasBoilerplateReview, normalizeCoverageState } from "./compatibility-contract.mjs";
import {
  isInitialSchemaV3Comparison,
  readJsonFromGitRef,
  resolveCompatibilityComparisonRef,
} from "./git-compare.mjs";

const COMPATIBILITY_GIT_PATH = "docs/agent-browser-compatibility.json";
const STATUS_RANK = new Map([
  ["not_available", 0],
  ["best_effort", 1],
  ["exact", 2],
]);

export function compatibilityRatchetFailures(currentCompatibility, previousCompatibility) {
  if (previousCompatibility?.schemaVersion !== 3) {
    return {
      skipped: true,
      failures: [],
      reason: "comparison matrix is missing or is not schemaVersion 3",
    };
  }

  const failures = [];
  const currentItems = compatibilityItems(currentCompatibility);
  const previousItemsById = new Map(compatibilityItems(previousCompatibility).map((item) => [item.id, item]));
  const currentItemsById = new Map(currentItems.map((item) => [item.id, item]));

  for (const item of currentItems) {
    const previous = previousItemsById.get(item.id);
    if (!previous) continue;

    const previousRank = STATUS_RANK.get(previous.status);
    const currentRank = STATUS_RANK.get(item.status);
    if (previousRank == null || currentRank == null) continue;

    if (currentRank > previousRank) {
      if (item.contractReviewed !== true) {
        failures.push(`status improvement for ${item.id} requires contractReviewed=true`);
      }
      if (!hasEffectiveCoverage(item, currentItemsById)) {
        failures.push(`status improvement for ${item.id} requires direct or canonical covered coverage`);
      }
    }

    if (currentRank < previousRank) {
      if (item.contractReviewed !== true) {
        failures.push(`status downgrade for ${item.id} requires contractReviewed=true`);
      }
      if (item.rationale === previous.rationale && item.disposition === previous.disposition) {
        failures.push(`status downgrade for ${item.id} requires changed rationale or disposition`);
      }
    }

    if (previous.contractReviewed !== true && item.contractReviewed === true && hasBoilerplateReview(item)) {
      failures.push(`contractReviewed flip for ${item.id} still uses boilerplate rationale or contract text`);
    }
  }

  return { skipped: false, failures };
}

export function hasCompatibilityRatchetFailures(result) {
  return !result.skipped && result.failures.length > 0;
}

function hasEffectiveCoverage(item, itemById) {
  if (normalizeCoverageState(item.coverage?.state) !== "covered") return false;
  if (!item.canonicalItemId) return true;
  const canonical = itemById.get(item.canonicalItemId);
  return normalizeCoverageState(canonical?.coverage?.state) === "covered";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const current = JSON.parse(readFileSync(COMPATIBILITY_PATH, "utf8"));
  const comparison = resolveCompatibilityComparisonRef();
  const previousResult = readJsonFromGitRef(comparison.ref, COMPATIBILITY_GIT_PATH);

  if (isInitialSchemaV3Comparison(previousResult)) {
    console.log(
      `Compatibility matrix at ${comparison.ref} is missing or not schemaVersion 3; skipping diff-only ratchet checks for initial v3 introduction.`
    );
    process.exit(0);
  }

  const result = compatibilityRatchetFailures(current, previousResult.value);
  if (hasCompatibilityRatchetFailures(result)) {
    console.error("Compatibility matrix ratchet failed:");
    for (const failure of result.failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log(`Compatibility matrix ratchet passed against ${comparison.ref} (${comparison.source}).`);
}
