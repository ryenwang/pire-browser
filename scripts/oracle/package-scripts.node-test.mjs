import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { REPO_ROOT } from "./oracle-lib.mjs";

test("package exposes a machine-safe JSON oracle report script", () => {
  const packageJson = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8"));
  assert.equal(packageJson.scripts?.["oracle:report:json"], "node scripts/oracle/report.mjs --json");
});
