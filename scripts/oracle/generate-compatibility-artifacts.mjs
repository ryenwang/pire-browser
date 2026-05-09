import { existsSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_BROWSER_DOCS_ROOT,
  COMPATIBILITY_PATH,
  DOCS_MANIFEST_PATH,
  REPO_ROOT,
  UNSUPPORTED_ROOTS_PATH,
  loadCompatibility,
  writeJson,
} from "./oracle-lib.mjs";
import {
  buildDocsManifest,
  compatibilityItems,
  unsupportedRootProvenance,
  unsupportedRuntimeRoots,
} from "./compatibility-contract.mjs";

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await main();
}

export async function main() {
  const checkOnly = process.argv.includes("--check");
  const compatibility = await loadCompatibility();
  const artifacts = [
    {
      path: UNSUPPORTED_ROOTS_PATH,
      value: buildUnsupportedRootsArtifact(compatibility),
    },
    {
      path: DOCS_MANIFEST_PATH,
      value: buildDocsManifest(compatibility, {
        docsRoot: AGENT_BROWSER_DOCS_ROOT,
        compatibilityMatrixPath: relative(REPO_ROOT, COMPATIBILITY_PATH),
        docsRootPath: relative(REPO_ROOT, AGENT_BROWSER_DOCS_ROOT),
      }),
    },
  ];

  if (checkOnly) {
    for (const artifact of artifacts) {
      if (!generatedArtifactIsCurrent(artifact.path, artifact.value)) {
        console.error(
          `Generated compatibility artifact is stale or missing: ${relative(REPO_ROOT, artifact.path)}. Run: node scripts/oracle/generate-compatibility-artifacts.mjs`
        );
        process.exit(1);
      }
    }
    console.log("Generated compatibility artifacts are up to date.");
    return;
  }

  for (const artifact of artifacts) {
    await writeJson(artifact.path, artifact.value);
    console.log(`Wrote ${relative(REPO_ROOT, artifact.path)}`);
  }
}

export function buildUnsupportedRootsArtifact(compatibility) {
  const items = compatibilityItems(compatibility);
  return {
    schemaVersion: 2,
    source: {
      compatibilityMatrix: relative(REPO_ROOT, COMPATIBILITY_PATH).replace(/\\/g, "/"),
      package: compatibility.source?.package ?? null,
      version: compatibility.source?.version ?? null,
      sourceCommit: compatibility.source?.sourceCommit ?? null,
    },
    unsupportedRoots: [...unsupportedRuntimeRoots(items)].sort(),
    roots: unsupportedRootProvenance(items),
  };
}

function generatedArtifactIsCurrent(path, value) {
  if (!existsSync(path)) return false;
  const expected = `${JSON.stringify(value, null, 2)}\n`;
  const actual = readFileSync(path, "utf8");
  return actual === expected;
}
