import { filterCases, scoreResponse } from "./scoring.mjs";
import { buildPrompt, loadSkill } from "./prompt.mjs";
import { EvalError, redactSecrets, runProvider } from "./provider.mjs";
import { createReport } from "./report.mjs";

function normalizeError(error) {
  return {
    code: error?.code ?? "EVAL_ERROR",
    message: redactSecrets(error?.message ?? String(error)),
  };
}

function parseJudge(text) {
  try {
    const parsed = JSON.parse(text);
    const value = parsed.score ?? parsed.judgement?.score;
    if (typeof value !== "number" || value < 0 || value > 1) throw new Error("judge score must be between 0 and 1");
    return { score: value, reason: redactSecrets(String(parsed.reason ?? parsed.judgement?.reason ?? "")) };
  } catch (error) {
    throw new EvalError("JUDGE_INVALID_OUTPUT", `judge response was not valid JSON with a 0..1 score: ${error.message}`);
  }
}

async function judgeResult({ result, item, options, invokeProvider }) {
  if (options.judge === "none") return result;
  const prompt = `Judge this proposed pire-browser workflow for case ${item.id}. Return only JSON: {"score": number from 0 to 1, "reason": "short explanation"}. Do not execute commands.\n\nProposed workflow:\n${redactSecrets(result.response)}`;
  const judged = await invokeProvider({
    provider: options.judge,
    model: options.judgeModel,
    prompt,
    timeoutMs: options.judgeTimeoutMs,
  });
  return { ...result, judge: parseJudge(judged.text) };
}

export async function runEvaluation({ cases, options, invokeProvider = runProvider, skillText, now = () => new Date() }) {
  const selected = filterCases(cases, options);
  if (selected.length === 0) {
    throw new EvalError("NO_CASES_SELECTED", "No workflow eval cases match the requested category or case filter.");
  }
  const injectedSkill = skillText ?? await loadSkill();
  const startedAt = now().toISOString();
  const results = [];
  for (const item of selected) {
    try {
      const prompt = buildPrompt(item, injectedSkill);
      const response = await invokeProvider({ provider: options.provider, model: options.model, prompt, timeoutMs: options.timeoutMs });
      const result = await judgeResult({
        result: { provider: response.provider ?? options.provider, response: response.text, score: scoreResponse(response.text, item) },
        item,
        options,
        invokeProvider,
      });
      results.push({ ...result, error: undefined });
    } catch (error) {
      results.push({
        provider: options.provider,
        score: scoreResponse("", item),
        error: normalizeError(error),
      });
    }
  }
  return createReport({ options, cases: selected.map((item, index) => ({ ...item, ...results[index] })), startedAt, finishedAt: now().toISOString() });
}
