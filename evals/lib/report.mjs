import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { redactSecrets } from "./provider.mjs";

export const REPORT_SCHEMA = "pire-browser/evals/v1";

export function createReport({ options, cases, startedAt, finishedAt = new Date().toISOString() }) {
  const results = cases.map((item) => ({
    id: item.id,
    category: item.category,
    title: item.title,
    status: item.error ? "error" : item.score.passed ? "passed" : "failed",
    score: item.score.score,
    rubric: item.score,
    provider: item.provider,
    judge: item.judge,
    response: item.response === undefined ? undefined : {
      text: redactSecrets(item.response),
      length: String(item.response).length,
    },
    error: item.error,
  }));
  const passed = results.filter((item) => item.status === "passed").length;
  const failed = results.filter((item) => item.status === "failed").length;
  const errored = results.filter((item) => item.status === "error").length;
  const averageScore = results.length === 0 ? 0 : Number((results.reduce((sum, item) => sum + item.score, 0) / results.length).toFixed(3));
  return {
    schema: REPORT_SCHEMA,
    startedAt,
    finishedAt,
    options: {
      provider: options.provider,
      model: options.model,
      categories: options.categories,
      caseIds: options.caseIds,
      timeoutMs: options.timeoutMs,
      json: options.json,
      output: options.output,
      judge: options.judge,
      judgeModel: options.judgeModel,
      judgeTimeoutMs: options.judgeTimeoutMs,
    },
    summary: { total: results.length, passed, failed, errored, averageScore, ok: results.length > 0 && errored === 0 && failed === 0 },
    cases: results,
  };
}

export async function writeReport(path, report) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

export function formatHumanReport(report) {
  const lines = [`pire-browser workflow evals: ${report.summary.passed}/${report.summary.total} passed (average ${report.summary.averageScore})`];
  for (const item of report.cases) {
    const detail = item.status === "error" ? ` ${item.error.code}: ${item.error.message}` : ` score=${item.score}`;
    lines.push(`${item.status.padEnd(7)} ${item.id}${detail}`);
  }
  return lines.join("\n");
}
