#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pages } from "../docs/src/content.mjs";

const EXPECTED_ROUTE_COUNT = 33;

execFileSync(process.execPath, ["scripts/build-pages-site.mjs"], {
  stdio: "inherit",
});

if (pages.length !== EXPECTED_ROUTE_COUNT) {
  throw new Error(`Expected ${EXPECTED_ROUTE_COUNT} docs routes, found ${pages.length}`);
}

const searchIndexPath = join("site", "assets", "search-index.json");
const searchIndex = JSON.parse(readFileSync(searchIndexPath, "utf8"));
const missingSnippets = searchIndex.filter(
  (entry) => typeof entry.snippet !== "string" || entry.snippet.trim().length === 0,
);

if (missingSnippets.length > 0) {
  const labels = missingSnippets
    .slice(0, 10)
    .map((entry) => `${entry.title ?? "(untitled)"} ${entry.path ?? ""}`.trim())
    .join(", ");
  throw new Error(
    `Expected every search index entry to include a snippet; missing ${missingSnippets.length}: ${labels}`,
  );
}

console.log(`Docs test passed: ${pages.length} routes and ${searchIndex.length} search entries.`);
