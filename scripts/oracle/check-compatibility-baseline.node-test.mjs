import assert from "node:assert/strict";
import test from "node:test";
import { baselineAdditions, hasBaselineAdditions } from "./check-compatibility-baseline.mjs";

test("baseline guard rejects additions but allows removals and reordering", () => {
  const additions = baselineAdditions(
    {
      exact: ["b", "a", "new-exact"],
      best_effort: ["old-best"],
    },
    {
      exact: ["a", "b", "removed-exact"],
      best_effort: ["old-best", "removed-best"],
    }
  );

  assert.deepEqual(additions, {
    exact: ["new-exact"],
    best_effort: [],
  });
  assert.equal(hasBaselineAdditions(additions), true);
  assert.equal(hasBaselineAdditions({ exact: [], best_effort: [] }), false);
});
