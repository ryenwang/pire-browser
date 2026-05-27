import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ORACLE_RUNS_ROOT,
  evaluateCoveragePolicy,
  loadCases,
  loadCompatibility,
  loadCompatibilityBaseline,
  loadUnsupportedRoots,
  normalizeOutput,
} from "./oracle-lib.mjs";
import {
  canonicalLinkCandidateRecords,
  compatibilityItems,
  reviewQueueItems,
  reviewQueueSummary,
} from "./compatibility-contract.mjs";
import {
  findPreviousGreenRun,
  parseReportArgs,
  readSummary,
  reportExitCode,
  selectReportRun,
  shouldEnforceCoverage,
} from "./report-lib.mjs";
import { redactDiagnosticText } from "./redaction.mjs";

const argv = process.argv.slice(2);
const options = parseReportArgs(argv);
const allCases = await loadCases();
const compatibility = await loadCompatibility();
const compatibilityBaseline = await loadCompatibilityBaseline();
const unsupportedRoots = await loadUnsupportedRoots();
const selectedRun = await selectReportRun({ runsRoot: ORACLE_RUNS_ROOT, argv, allCases });
if (!selectedRun) {
  const policy = evaluateCoveragePolicy(compatibility, [], compatibilityBaseline);
  if (options.json) {
    printJsonReport({
      selectedRun: null,
      summary: null,
      failed: [],
      coveragePolicy: policy,
      enforceCoverage: true,
      compatibility,
      unsupportedRoots,
    });
    process.exit(policy.pass ? 0 : 1);
  }
  console.log(
    options.latestAny
      ? `No oracle runs found below ${ORACLE_RUNS_ROOT}`
      : `No coverage-complete oracle runs found below ${ORACLE_RUNS_ROOT}. Run npm run oracle:compare, or pass --latest-any to inspect the newest subset run.`
  );
  printCoveragePolicy(policy);
  printReviewQueue(compatibility, { full: options.reviewQueue });
  if (options.reviewQueue || options.unsupportedRoots) printUnsupportedRoots(unsupportedRoots);
  process.exit(policy.pass ? 0 : 1);
}

const summary = readSummary(selectedRun);
const previousGreen = options.diffLastGreen
  ? await findPreviousGreenRun({ runsRoot: ORACLE_RUNS_ROOT, currentPath: selectedRun })
  : null;
const coveragePolicy = evaluateCoveragePolicy(compatibility, summary.cases ?? [], compatibilityBaseline);
const enforceCoverage = shouldEnforceCoverage({ summary, options, allCases });
const failed = (summary.cases ?? []).filter((testCase) => !testCase.pass);

if (options.json) {
  printJsonReport({
    selectedRun,
    summary,
    failed,
    coveragePolicy,
    enforceCoverage,
    compatibility,
    unsupportedRoots,
  });
  process.exit(reportExitCode({ summary, coveragePolicy, options, allCases }));
}

console.log(`Oracle report: ${summary.pass ? "PASS" : "FAIL"}`);
console.log(`Run: ${selectedRun}`);
if (summary.runKind) console.log(`Run kind: ${summary.runKind}`);
if (typeof summary.coverageComplete === "boolean") console.log(`Coverage complete: ${summary.coverageComplete}`);
console.log(`Started: ${summary.startedAt ?? "unknown"}`);
console.log(`Finished: ${summary.finishedAt ?? "unknown"}`);
console.log("");

if (failed.length) {
  console.log("Failed cases:");
  for (const testCase of failed) {
    console.log(`- ${testCase.id}: ${redactDiagnosticText(testCase.reason)}`);
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
printReviewQueue(compatibility, { full: options.reviewQueue });
if (options.reviewQueue || options.unsupportedRoots) printUnsupportedRoots(unsupportedRoots);

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
      console.log(`Step ${step.id}: ${redactDiagnosticText(step.commandTemplate)}`);
      console.log(`agent-browser exit=${step.agentBrowser?.exitCode} finish=${step.agentBrowser?.finishReason}`);
      console.log(`pire-browser exit=${step.pireBrowser?.exitCode} finish=${step.pireBrowser?.finishReason}`);
      console.log(`agent stdout: ${redactDiagnosticText(normalizeOutput(step.agentBrowser?.stdout)).slice(0, 300)}`);
      console.log(`pire stdout: ${redactDiagnosticText(normalizeOutput(step.pireBrowser?.stdout)).slice(0, 300)}`);
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
  console.log("Covered best-effort compatibility items:");
  if (policy.coveredBestEffortItems.length) {
    for (const item of policy.coveredBestEffortItems) console.log(`- ${item}`);
  } else {
    console.log("- none");
  }

  console.log("");
  console.log("Covered by canonical compatibility items:");
  if (policy.coveredByCanonicalItems?.length) {
    for (const item of policy.coveredByCanonicalItems) {
      console.log(`- ${item.id} -> ${item.canonicalItemId}`);
    }
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
  console.log("Uncovered existing best-effort compatibility items:");
  if (policy.uncoveredExistingBestEffortItems.length) {
    for (const item of policy.uncoveredExistingBestEffortItems) console.log(`- ${item}`);
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

  console.log("");
  console.log("Not-comparable compatibility items:");
  if (policy.notComparableItems.length) {
    for (const item of policy.notComparableItems) console.log(`- ${item}`);
  } else {
    console.log("- none");
  }

  console.log("");
  console.log("Smoke-only compatibility items:");
  if (policy.smokeOnlyItems.length) {
    for (const item of policy.smokeOnlyItems) console.log(`- ${item}`);
  } else {
    console.log("- none");
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

function printReviewQueue(compatibility, { full = false } = {}) {
  const items = compatibilityItems(compatibility);
  const summary = reviewQueueSummary(items);
  console.log("");
  console.log("Unreviewed compatibility rows by epic/status/disposition:");
  if (summary.length) {
    for (const group of summary) {
      console.log(`- ${group.ownerEpic} / ${group.status} / ${group.disposition}: ${group.count}`);
    }
  } else {
    console.log("- none");
  }

  if (!full) return;
  console.log("");
  console.log("Review queue:");
  let currentEpic = "";
  for (const item of reviewQueueItems(items)) {
    if (item.ownerEpic !== currentEpic) {
      currentEpic = item.ownerEpic;
      console.log(`## ${currentEpic ?? "Unassigned"}`);
    }
    console.log(`- ${item.id} [${item.status}/${item.disposition}]`);
  }

  const candidates = canonicalLinkCandidateRecords(items);
  console.log("");
  console.log("Possible canonical links:");
  if (candidates.length) {
    for (const candidate of candidates) {
      console.log(`- ${candidate.id} -> ${candidate.canonicalItemId} (${candidate.commandRoot})`);
    }
  } else {
    console.log("- none");
  }
}

function printUnsupportedRoots(artifact) {
  console.log("");
  console.log("Unsupported root provenance:");
  for (const record of artifact.roots ?? []) {
    console.log(`- ${record.root}: ${record.itemIds.join(", ")}`);
  }
}

function printJsonReport({ selectedRun, summary, failed, coveragePolicy, enforceCoverage, compatibility, unsupportedRoots }) {
  const items = compatibilityItems(compatibility);
  const payload = {
    metadata: {
      generatedAt: new Date().toISOString(),
      selectedRun,
      enforceCoverage,
      schemaVersion: compatibility?.schemaVersion ?? null,
    },
    run: summary
      ? {
          pass: summary.pass,
          runKind: summary.runKind ?? null,
          coverageComplete: summary.coverageComplete ?? null,
          startedAt: summary.startedAt ?? null,
          finishedAt: summary.finishedAt ?? null,
        }
      : null,
    failures: failed.map((testCase) => ({
      id: testCase.id,
      reason: testCase.reason == null ? null : redactDiagnosticText(testCase.reason),
    })),
    coveragePolicy: {
      pass: coveragePolicy.pass,
      failures: coveragePolicy.failures,
      coveredExactItems: coveragePolicy.coveredExactItems,
      coveredBestEffortItems: coveragePolicy.coveredBestEffortItems,
      coveredByCanonicalItems: coveragePolicy.coveredByCanonicalItems,
      uncoveredExistingExactItems: coveragePolicy.uncoveredExistingExactItems,
      uncoveredExistingBestEffortItems: coveragePolicy.uncoveredExistingBestEffortItems,
      invalidNewExactClaims: coveragePolicy.invalidNewExactClaims,
      invalidNewBestEffortClaims: coveragePolicy.invalidNewBestEffortClaims,
      notComparableItems: coveragePolicy.notComparableItems,
      smokeOnlyItems: coveragePolicy.smokeOnlyItems,
      coveredWithoutPassingCase: coveragePolicy.coveredWithoutPassingCase,
      missingCoverageDocs: coveragePolicy.missingCoverageDocs,
      staleCoverageDocs: coveragePolicy.staleCoverageDocs,
    },
    canonicalCoverage: coveragePolicy.coveredByCanonicalItems,
    reviewQueue: {
      summary: reviewQueueSummary(items),
      items: reviewQueueItems(items).map((item) => ({
        id: item.id,
        ownerEpic: item.ownerEpic,
        status: item.status,
        disposition: item.disposition,
      })),
    },
    canonicalCandidates: canonicalLinkCandidateRecords(items),
    unsupportedRootProvenance: unsupportedRoots?.roots ?? [],
  };
  console.log(JSON.stringify(payload, null, 2));
}
