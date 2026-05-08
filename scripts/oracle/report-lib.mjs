import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export function parseReportArgs(argv) {
  const options = {
    latestAny: false,
    diffLastGreen: false,
    enforceCoverage: false,
    failedDetails: false,
    run: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--latest-any") options.latestAny = true;
    else if (arg === "--diff-last-green") options.diffLastGreen = true;
    else if (arg === "--enforce-coverage") options.enforceCoverage = true;
    else if (arg === "--failed-details") options.failedDetails = true;
    else if (arg === "--run") {
      const value = argv[index + 1];
      if (!value) throw new Error("--run requires a run directory");
      options.run = value;
      index += 1;
    } else {
      throw new Error(`Unknown oracle:report argument: ${arg}`);
    }
  }
  return options;
}

export async function selectReportRun({ runsRoot, argv = [], allCases = [], cwd = process.cwd() }) {
  const options = parseReportArgs(argv);
  if (options.run) return resolveRunPath(options.run, runsRoot, cwd);

  const entries = await runEntries(runsRoot);
  if (options.latestAny) return entries.at(0)?.path ?? null;

  return entries.find((entry) => isCoverageCompleteSummary(readSummary(entry.path), allCases))?.path ?? null;
}

export async function findPreviousGreenRun({ runsRoot, currentPath }) {
  for (const entry of await runEntries(runsRoot)) {
    if (entry.path === currentPath) continue;
    const summaryPath = join(entry.path, "summary.json");
    if (!existsSync(summaryPath)) continue;
    const summary = JSON.parse(readFileSync(summaryPath, "utf8"));
    if (summary.pass) return entry.path;
  }
  return null;
}

export async function runEntries(runsRoot) {
  if (!existsSync(runsRoot)) return [];
  const names = await readdir(runsRoot, { withFileTypes: true });
  return names
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const path = join(runsRoot, entry.name);
      const summaryPath = join(path, "summary.json");
      return {
        name: entry.name,
        path,
        sortKey: existsSync(summaryPath) ? readSummary(path).finishedAt ?? entry.name : entry.name,
      };
    })
    .sort((left, right) => String(right.sortKey).localeCompare(String(left.sortKey)));
}

export function readSummary(runPath) {
  const summaryPath = join(runPath, "summary.json");
  if (!existsSync(summaryPath)) throw new Error(`Missing summary.json in ${runPath}`);
  return JSON.parse(readFileSync(summaryPath, "utf8"));
}

export function isCoverageCompleteSummary(summary, allCases) {
  if (typeof summary.coverageComplete === "boolean") return summary.coverageComplete;
  const expectedIds = allCases.filter((testCase) => testCase.status !== "smoke").map((testCase) => testCase.id);
  const runIds = (summary.cases ?? []).map((testCase) => testCase.id);
  return expectedIds.length > 0 && sameStringSet(runIds, expectedIds);
}

export function shouldEnforceCoverage({ summary, options = {}, allCases = [] }) {
  return Boolean(options.enforceCoverage || isCoverageCompleteSummary(summary, allCases));
}

export function reportExitCode({ summary, coveragePolicy, options = {}, allCases = [] }) {
  if (summary.pass === false) return 1;
  if (shouldEnforceCoverage({ summary, options, allCases }) && coveragePolicy.pass === false) return 1;
  return 0;
}

function resolveRunPath(value, runsRoot, cwd) {
  const direct = isAbsolute(value) ? value : resolve(cwd, value);
  if (existsSync(direct)) return direct;
  const fromRunsRoot = resolve(runsRoot, value);
  if (existsSync(fromRunsRoot)) return fromRunsRoot;
  throw new Error(`Oracle run directory not found: ${value}`);
}

function sameStringSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}
