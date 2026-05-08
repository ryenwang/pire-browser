import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ORACLE_RUNS_ROOT,
  evaluateCoveragePolicy,
  loadCases,
  loadCompatibility,
  normalizeOutput,
} from "./oracle-lib.mjs";
import {
  findPreviousGreenRun,
  parseReportArgs,
  readSummary,
  reportExitCode,
  selectReportRun,
  shouldEnforceCoverage,
} from "./report-lib.mjs";

const argv = process.argv.slice(2);
const options = parseReportArgs(argv);
const allCases = await loadCases();
const selectedRun = await selectReportRun({ runsRoot: ORACLE_RUNS_ROOT, argv, allCases });
if (!selectedRun) {
  console.log(
    options.latestAny
      ? `No oracle runs found below ${ORACLE_RUNS_ROOT}`
      : `No coverage-complete oracle runs found below ${ORACLE_RUNS_ROOT}. Run npm run oracle:compare, or pass --latest-any to inspect the newest subset run.`
  );
  const policy = evaluateCoveragePolicy(await loadCompatibility(), []);
  printCoveragePolicy(policy);
  process.exit(policy.pass ? 0 : 1);
}

const summary = readSummary(selectedRun);
const previousGreen = options.diffLastGreen
  ? await findPreviousGreenRun({ runsRoot: ORACLE_RUNS_ROOT, currentPath: selectedRun })
  : null;
const coveragePolicy = evaluateCoveragePolicy(await loadCompatibility(), summary.cases ?? []);
const enforceCoverage = shouldEnforceCoverage({ summary, options, allCases });

console.log(`Oracle report: ${summary.pass ? "PASS" : "FAIL"}`);
console.log(`Run: ${selectedRun}`);
if (summary.runKind) console.log(`Run kind: ${summary.runKind}`);
if (typeof summary.coverageComplete === "boolean") console.log(`Coverage complete: ${summary.coverageComplete}`);
console.log(`Started: ${summary.startedAt ?? "unknown"}`);
console.log(`Finished: ${summary.finishedAt ?? "unknown"}`);
console.log("");

const failed = (summary.cases ?? []).filter((testCase) => !testCase.pass);
if (failed.length) {
  console.log("Failed cases:");
  for (const testCase of failed) {
    console.log(`- ${testCase.id}: ${testCase.reason}`);
  }
} else {
  console.log("Failed cases: none");
}

const uncoveredExact = summary.coverage?.uncoveredExact ?? [];
if (uncoveredExact.length) {
  console.log("");
  console.log("Uncovered exact compatibility items:");
  for (const item of uncoveredExact) console.log(`- ${item}`);
}

printCoveragePolicy(coveragePolicy, { enforced: enforceCoverage });

if (previousGreen) {
  const previous = readSummary(previousGreen);
  const previousFailures = new Set((previous.cases ?? []).filter((testCase) => !testCase.pass).map((testCase) => testCase.id));
  const newFailures = failed.filter((testCase) => !previousFailures.has(testCase.id));
  console.log("");
  console.log(`Compared with previous passing run: ${previousGreen}`);
  console.log(`New failures: ${newFailures.length ? newFailures.map((testCase) => testCase.id).join(", ") : "none"}`);
}

if (options.failedDetails) {
  console.log("");
  for (const testCase of failed) {
    const resultPath = join(selectedRun, testCase.id, "result.json");
    if (!existsSync(resultPath)) continue;
    const result = JSON.parse(readFileSync(resultPath, "utf8"));
    console.log(`## ${testCase.id}`);
    for (const step of result.steps ?? []) {
      if (step.pass) continue;
      console.log(`Step ${step.id}: ${step.commandTemplate}`);
      console.log(`agent-browser exit=${step.agentBrowser?.exitCode} finish=${step.agentBrowser?.finishReason}`);
      console.log(`pire-browser exit=${step.pireBrowser?.exitCode} finish=${step.pireBrowser?.finishReason}`);
      console.log(`agent stdout: ${normalizeOutput(step.agentBrowser?.stdout).slice(0, 300)}`);
      console.log(`pire stdout: ${normalizeOutput(step.pireBrowser?.stdout).slice(0, 300)}`);
      console.log("");
    }
  }
}

process.exitCode = reportExitCode({ summary, coveragePolicy, options, allCases });

function printCoveragePolicy(policy, { enforced = true } = {}) {
  console.log("");
  console.log(`Oracle coverage policy${enforced ? "" : " (informational)"}: ${policy.pass ? "PASS" : "FAIL"}`);
  console.log("Covered exact compatibility items:");
  if (policy.coveredExactItems.length) {
    for (const item of policy.coveredExactItems) console.log(`- ${item}`);
  } else {
    console.log("- none");
  }

  console.log("");
  console.log("Uncovered existing exact compatibility items:");
  if (policy.uncoveredExistingExactItems.length) {
    for (const item of policy.uncoveredExistingExactItems) console.log(`- ${item}`);
  } else {
    console.log("- none");
  }

  console.log("");
  console.log("Invalid new/upgraded exact claims:");
  if (policy.invalidNewExactClaims.length) {
    for (const item of policy.invalidNewExactClaims) console.log(`- ${item}`);
  } else {
    console.log("- none");
  }

  if (policy.invalidNewBestEffortClaims.length) {
    console.log("");
    console.log("Invalid new/upgraded best-effort claims:");
    for (const item of policy.invalidNewBestEffortClaims) console.log(`- ${item}`);
  }

  if (policy.coveredWithoutPassingCase.length) {
    console.log("");
    console.log("Docs marked covered without a passing case:");
    for (const item of policy.coveredWithoutPassingCase) console.log(`- ${item}`);
  }

  if (policy.missingCoverageDocs.length) {
    console.log("");
    console.log("Compatibility items missing oracleCoverage metadata:");
    for (const item of policy.missingCoverageDocs) console.log(`- ${item}`);
  }

  if (policy.staleCoverageDocs.length) {
    console.log("");
    console.log("Stale oracleCoverage metadata entries:");
    for (const item of policy.staleCoverageDocs) console.log(`- ${item}`);
  }
}
