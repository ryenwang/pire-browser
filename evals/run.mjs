#!/usr/bin/env node
import { CASES } from "./lib/cases.mjs";
import { parseArgs, usage } from "./lib/options.mjs";
import { formatHumanReport, writeReport } from "./lib/report.mjs";
import { runEvaluation } from "./lib/runner.mjs";

async function main() {
  let parsed;
  try {
    parsed = parseArgs();
  } catch (error) {
    console.error("evals: " + error.message);
    console.error("\n" + usage());
    return 2;
  }
  if (parsed.help) {
    console.log(usage());
    return 0;
  }

  try {
    const report = await runEvaluation({ cases: CASES, options: parsed.options });
    if (parsed.options.output) await writeReport(parsed.options.output, report);
    if (parsed.options.json) console.log(JSON.stringify(report, null, 2));
    else console.log(formatHumanReport(report));
    return report.summary.ok ? 0 : 1;
  } catch (error) {
    const message = error?.message ?? String(error);
    if (parsed.options.json) {
      console.log(JSON.stringify({ schema: "pire-browser/evals/v1", summary: { ok: false }, error: { code: error?.code ?? "EVAL_ERROR", message } }, null, 2));
    } else {
      console.error("evals: " + (error?.code ? error.code + ": " : "") + message);
    }
    return 2;
  }
}

if (process.argv[1]?.endsWith("/evals/run.mjs") || process.argv[1]?.endsWith("\\evals\\run.mjs")) {
  process.exitCode = await main();
}

export { main };
