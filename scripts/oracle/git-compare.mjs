import { execFileSync } from "node:child_process";
import { REPO_ROOT } from "./oracle-lib.mjs";

export function resolveCompatibilityComparisonRef({
  env = process.env,
  cwd = REPO_ROOT,
  execFileSyncImpl = execFileSync,
} = {}) {
  const explicit = env.ORACLE_COMPATIBILITY_BASE_REF?.trim();
  if (explicit) return { ref: explicit, source: "ORACLE_COMPATIBILITY_BASE_REF" };

  const githubBaseRef = env.GITHUB_BASE_REF?.trim();
  if (githubBaseRef) {
    const candidate = `origin/${githubBaseRef}`;
    if (gitRefExists(candidate, { cwd, execFileSyncImpl })) {
      return { ref: candidate, source: "GITHUB_BASE_REF" };
    }
  }

  return { ref: "HEAD", source: "HEAD" };
}

export function readJsonFromGitRef(ref, path, { cwd = REPO_ROOT, execFileSyncImpl = execFileSync } = {}) {
  try {
    const text = execFileSyncImpl("git", ["show", `${ref}:${path}`], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { found: true, value: JSON.parse(text), ref, path };
  } catch (error) {
    return { found: false, error, ref, path };
  }
}

export function isInitialSchemaV3Comparison(readResult) {
  return readResult?.found !== true || readResult.value?.schemaVersion !== 3;
}

function gitRefExists(ref, { cwd, execFileSyncImpl }) {
  try {
    execFileSyncImpl("git", ["rev-parse", "--verify", `${ref}^{commit}`], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}
