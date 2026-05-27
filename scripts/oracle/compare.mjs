import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  BASELINE_COMMIT,
  BASELINE_PACKAGE,
  ORACLE_ROOT,
  createRunDir,
  evaluateCoveragePolicy,
  listFilesSafe,
  loadCases,
  loadCompatibility,
  loadCompatibilityBaseline,
  readInstalledAgentBrowserVersion,
  resolveAgentBrowserExecutable,
  resolvePireExecutable,
  startFixtureServer,
  verifyInstalledAgentBrowserVersion,
  writeJson,
} from "./oracle-lib.mjs";
import { runOracleCases } from "./compare-runner.mjs";
import { selectOracleCases } from "./compare-selection.mjs";
import { redactArtifact, redactDiagnosticText } from "./redaction.mjs";

const timeoutMs = Number.parseInt(process.env.ORACLE_COMMAND_TIMEOUT_MS ?? "45000", 10);
const probeTimeoutMs = Number.parseInt(process.env.ORACLE_PROBE_TIMEOUT_MS ?? "10000", 10);
const visibleRun = process.env.ORACLE_VISIBLE_RUN === "1";
const allCases = await loadCases();
const selectionResult = selectOracleCases(allCases, {
  caseFilterText: process.env.ORACLE_CASE_FILTER ?? "",
  visibleOnly: process.env.ORACLE_VISIBLE_ONLY === "1",
  visibleRun,
  includeSmoke: process.env.ORACLE_INCLUDE_SMOKE === "1",
});
const cases = selectionResult.cases;

verifyInstalledAgentBrowserVersion();

const runDir = createRunDir(visibleRun ? "visible-compare" : "cli");
const runLogDir = join(runDir, "logs");
const pireLocalAppDataRoot = join(runDir, "pire-local-app-data");
mkdirSync(runLogDir, { recursive: true });

const agentBrowser = resolveAgentBrowserExecutable();
const pireBrowser = resolvePireExecutable();
const fixture = await startFixtureServer();
const summary = {
  runDir,
  runKind: selectionResult.runKind,
  coverageComplete: selectionResult.coverageComplete,
  selection: selectionResult.selection,
  startedAt: new Date().toISOString(),
  fixtureUrl: fixture.url,
  metadata: {
    agentBrowser: {
      package: BASELINE_PACKAGE,
      version: readInstalledAgentBrowserVersion(),
      docsCommit: BASELINE_COMMIT,
      executable: agentBrowser,
    },
    pireBrowser: {
      executable: pireBrowser,
      version: process.env.npm_package_version ?? null,
    },
    os: {
      platform: process.platform,
      arch: process.arch,
      release: process.version,
    },
    profileDirs: {
      agentBrowserSocketDir: join(ORACLE_ROOT, "agent-browser-sockets"),
      agentBrowserProfile: process.env.AGENT_BROWSER_PROFILE ?? null,
      pireBrowserLocalAppData: pireLocalAppDataRoot,
      pireBrowserMode: process.env.PIRE_BROWSER_ORACLE_NAMED_SESSION === "1" ? "named" : "default-auto-launch",
    },
  },
  cases: [],
};

try {
  const caseRecords = await runOracleCases({
    cases,
    agentBrowser,
    pireBrowser,
    fixtureUrl: fixture.url,
    oracleRoot: ORACLE_ROOT,
    runLogDir,
    pireLocalAppDataRoot,
    timeoutMs,
    probeTimeoutMs,
    visibleRun,
    onCaseComplete: async (caseRecord) => {
      const caseDir = join(runDir, caseRecord.id);
      mkdirSync(caseDir, { recursive: true });
      await writeJson(join(caseDir, "result.json"), redactArtifact(caseRecord));
      console.log(`${caseRecord.pass ? "PASS" : "FAIL"} ${caseRecord.id}: ${redactDiagnosticText(caseRecord.reason)}`);
    },
  });

  summary.cases = caseRecords.map((caseRecord) => ({
    id: caseRecord.id,
    status: caseRecord.status,
    visibleSafe: caseRecord.visibleSafe,
    compatibilityItems: caseRecord.compatibilityItems,
    pass: caseRecord.pass,
    reason: redactDiagnosticText(caseRecord.reason),
  }));
} finally {
  await fixture.close();
}

summary.finishedAt = new Date().toISOString();
summary.pass = summary.cases.every((testCase) => testCase.pass);
summary.coverage = summarizeCoverage(summary.cases, await loadCompatibility(), await loadCompatibilityBaseline());
summary.files = await listFilesSafe(runDir);
await writeJson(join(runDir, "summary.json"), summary);

console.log("");
console.log(`Oracle comparison summary: ${summary.pass ? "PASS" : "FAIL"}`);
console.log(`Run artifacts: ${runDir}`);
process.exit(summary.pass ? 0 : 1);

function summarizeCoverage(cases, compatibility, compatibilityBaseline) {
  const items = cases.flatMap((testCase) => testCase.compatibilityItems ?? []);
  const policy = evaluateCoveragePolicy(compatibility, cases, compatibilityBaseline);
  return {
    totalItems: items.length,
    tapeCovered: items.filter((item) => item.tapeCovered).length,
    coveredExact: policy.coveredExactItems,
    uncoveredExact: policy.uncoveredExistingExactItems,
    invalidNewExactClaims: policy.invalidNewExactClaims,
  };
}
