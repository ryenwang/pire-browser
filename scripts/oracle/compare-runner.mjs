import { join } from "node:path";
import {
  captureRefsFromText,
  evaluateResultAssertions,
  normalizeOutput,
  renderTemplate,
  runCommand,
  splitCommand,
} from "./oracle-lib.mjs";

const URL_ASSERTIONS = new Set(["urlContains"]);
const TITLE_ASSERTIONS = new Set(["titleContains"]);
const DOM_ASSERTIONS = new Set(["domValue", "domText", "eventLogContains"]);

export async function runOracleCases({
  cases,
  agentBrowser,
  pireBrowser,
  fixtureUrl,
  oracleRoot,
  runLogDir,
  pireLocalAppDataRoot = join(oracleRoot, "pire-local-app-data"),
  timeoutMs,
  probeTimeoutMs,
  visibleRun = false,
  env = process.env,
  runCommandImpl = runCommand,
  onCaseComplete,
}) {
  const caseRecords = [];

  for (const testCase of cases) {
    const agentCtx = toolContext("agent-browser", testCase.id, fixtureUrl, {
      agentBrowser,
      pireBrowser,
      oracleRoot,
      pireLocalAppDataRoot,
    });
    const pireCtx = toolContext("pire-browser", testCase.id, fixtureUrl, {
      agentBrowser,
      pireBrowser,
      oracleRoot,
      pireLocalAppDataRoot,
    });
    const invoke = createInvoker({
      runCommandImpl,
      runLogDir,
      timeoutMs,
      visibleRun,
      env,
    });

    const caseRecord = {
      id: testCase.id,
      description: testCase.description,
      status: testCase.status,
      visibleSafe: testCase.visibleSafe,
      compatibilityItems: testCase.compatibilityItems,
      pass: false,
      reason: "",
      steps: [],
      finalAssertions: [],
      cleanup: {},
    };

    try {
      for (const step of testCase.steps) {
        const stepRecord = {
          id: step.id,
          commandTemplate: step.command,
          pass: false,
          agentBrowser: null,
          pireBrowser: null,
          captures: { agentBrowser: {}, pireBrowser: {} },
          state: null,
          assertions: [],
        };

        const eventLogBaselines = await captureEventLogBaselines(step.assertions ?? [], agentCtx, pireCtx, invoke, {
          probeTimeoutMs,
        });

        const showProcessWindow = Boolean(visibleRun && step.visible !== false);
        const [agentResult, pireResult] = await Promise.all([
          invoke.safely(agentCtx, step.command, step.id, { showProcessWindow }),
          invoke.safely(pireCtx, step.command, step.id, { showProcessWindow }),
        ]);
        stepRecord.agentBrowser = agentResult;
        stepRecord.pireBrowser = pireResult;
        stepRecord.captures.agentBrowser = applyCaptures(agentCtx, step, agentResult);
        stepRecord.captures.pireBrowser = applyCaptures(pireCtx, step, pireResult);

        const stateNeeds = stateNeedsForAssertions(step.assertions ?? []);
        if (stateNeeds.url || stateNeeds.title) {
          const [agentState, pireState] = await Promise.all([
            probeState(agentCtx, stateNeeds, invoke, { probeTimeoutMs }),
            probeState(pireCtx, stateNeeds, invoke, { probeTimeoutMs }),
          ]);
          stepRecord.state = {
            agentBrowser: agentState,
            pireBrowser: pireState,
          };
        }

        stepRecord.assertions = await evaluateAssertions(
          step.assertions ?? [],
          agentCtx,
          pireCtx,
          agentResult,
          pireResult,
          stepRecord.state,
          eventLogBaselines,
          invoke,
          { probeTimeoutMs }
        );
        stepRecord.pass = stepRecord.assertions.every((assertion) => assertion.pass);
        caseRecord.steps.push(stepRecord);

        if (!stepRecord.pass && (step.bail ?? testCase.bail ?? true)) break;
      }

      const finalAssertions = testCase.finalAssertions ?? [];
      if (finalAssertions.length) {
        const stateNeeds = stateNeedsForAssertions(finalAssertions);
        const finalState =
          stateNeeds.url || stateNeeds.title
            ? {
                agentBrowser: await probeState(agentCtx, stateNeeds, invoke, { probeTimeoutMs }),
                pireBrowser: await probeState(pireCtx, stateNeeds, invoke, { probeTimeoutMs }),
              }
            : null;
        caseRecord.finalAssertions = await evaluateAssertions(
          finalAssertions,
          agentCtx,
          pireCtx,
          null,
          null,
          finalState,
          null,
          invoke,
          { probeTimeoutMs }
        );
      }

      const failed = [
        ...caseRecord.steps.flatMap((step) => step.assertions.filter((assertion) => !assertion.pass)),
        ...caseRecord.finalAssertions.filter((assertion) => !assertion.pass),
      ];
      caseRecord.pass = failed.length === 0;
      caseRecord.reason = caseRecord.pass
        ? "all step assertions passed"
        : failed.map((assertion) => assertion.reason).join("; ");
    } catch (error) {
      caseRecord.pass = false;
      caseRecord.reason = error.message;
    } finally {
      caseRecord.cleanup.agentBrowser = await cleanup(agentCtx, invoke);
      caseRecord.cleanup.pireBrowser = await cleanup(pireCtx, invoke);
      caseRecords.push(caseRecord);
      await onCaseComplete?.(caseRecord);
    }
  }

  return caseRecords;
}

export function stateNeedsForAssertions(assertions) {
  return {
    url: assertions.some((assertion) => URL_ASSERTIONS.has(assertion.type)),
    title: assertions.some((assertion) => TITLE_ASSERTIONS.has(assertion.type)),
  };
}

function toolContext(tool, caseId, fixtureUrl, { agentBrowser, pireBrowser, oracleRoot, pireLocalAppDataRoot }) {
  const session = `oracle-${tool}-${caseId}-${Date.now()}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  if (tool === "agent-browser") {
    return {
      tool,
      executable: agentBrowser,
      globalArgs: ["--session", session],
      env: {
        AGENT_BROWSER_SOCKET_DIR: join(oracleRoot, "agent-browser-sockets"),
      },
      fixtureUrl,
      refs: {},
      captures: {},
    };
  }

  const useNamedPireSession = process.env.PIRE_BROWSER_ORACLE_NAMED_SESSION === "1";
  return {
    tool,
    executable: pireBrowser,
    globalArgs: useNamedPireSession ? ["--session", session] : [],
    env: {
      LOCALAPPDATA: pireLocalAppDataRoot,
    },
    fixtureUrl,
    refs: {},
    captures: {},
    sessionMode: useNamedPireSession ? "named" : "default-auto-launch",
  };
}

function createInvoker({ runCommandImpl, runLogDir, timeoutMs, env }) {
  async function invoke(toolCtx, commandTemplate, label, options = {}) {
    const command = renderTemplate(commandTemplate, {
      fixtureUrl: toolCtx.fixtureUrl,
      refs: toolCtx.refs,
      captures: toolCtx.captures,
    });
    const args = [...toolCtx.globalArgs, ...splitCommand(command)];
    const commandOptions = {
      timeoutMs: options.timeoutMs ?? timeoutMs,
      logDir: runLogDir,
      env: { ...env, ...toolCtx.env },
      windowsHide: !Boolean(options.showProcessWindow),
      resolveOnOutputIdleMs: Number.parseInt(env.ORACLE_OUTPUT_IDLE_MS ?? "1000", 10),
    };
    let result = await runCommandImpl(toolCtx.executable, args, commandOptions);
    if (shouldRetryAgentBrowserDaemonRestart(toolCtx, result)) {
      const retry = await runCommandImpl(toolCtx.executable, args, commandOptions);
      result = {
        ...retry,
        adapterRetry: "agent-browser-daemon-version-mismatch",
        previousStderr: result.stderr ?? "",
      };
    }
    return {
      label,
      command,
      args: result.args,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      finishReason: result.finishReason,
      outputIdle: Boolean(result.outputIdle),
      timedOut: result.timedOut,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      normalizedStdout: normalizeOutput(result.stdout),
      normalizedStderr: normalizeOutput(result.stderr),
      adapterRetry: result.adapterRetry,
      previousStderr: result.previousStderr,
    };
  }

  async function safely(toolCtx, commandTemplate, label, options = {}) {
    try {
      return await invoke(toolCtx, commandTemplate, label, options);
    } catch (error) {
      return {
        label,
        command: commandTemplate,
        exitCode: 1,
        finishReason: "render-error",
        timedOut: false,
        stdout: "",
        stderr: error.message,
        normalizedStdout: "",
        normalizedStderr: normalizeOutput(error.message),
        durationMs: 0,
      };
    }
  }

  return { invoke, safely };
}

function shouldRetryAgentBrowserDaemonRestart(toolCtx, result) {
  return (
    toolCtx.tool === "agent-browser" &&
    result.exitCode !== 0 &&
    /Daemon version mismatch detected, restarting/i.test(`${result.stdout ?? ""}\n${result.stderr ?? ""}`)
  );
}

async function probeState(toolCtx, needs, invoke, { probeTimeoutMs }) {
  const probes = {};
  let url = "";
  let title = "";
  const tasks = [];

  if (needs.url) {
    tasks.push(
      invoke.safely(toolCtx, "get url", "probe:url", { timeoutMs: probeTimeoutMs }).then((result) => {
        probes.url = result;
        if (result.exitCode === 0) url = result.stdout.trim();
      })
    );
  }
  if (needs.title) {
    tasks.push(
      invoke.safely(toolCtx, "get title", "probe:title", { timeoutMs: probeTimeoutMs }).then((result) => {
        probes.title = result;
        if (result.exitCode === 0) title = result.stdout.trim();
      })
    );
  }

  await Promise.all(tasks);
  return { url, title, probes };
}

async function evaluateAssertions(
  assertions,
  agentCtx,
  pireCtx,
  agentResult,
  pireResult,
  state,
  eventLogBaselines,
  invoke,
  { probeTimeoutMs }
) {
  const resultAssertions = [];
  const asyncAssertions = [];
  for (const assertion of assertions ?? []) {
    if (URL_ASSERTIONS.has(assertion.type) || TITLE_ASSERTIONS.has(assertion.type) || DOM_ASSERTIONS.has(assertion.type)) {
      asyncAssertions.push(assertion);
    } else {
      resultAssertions.push(assertion);
    }
  }

  const results =
    agentResult && pireResult ? evaluateResultAssertions(resultAssertions, agentResult, pireResult) : [];
  for (const assertion of asyncAssertions) {
    results.push(
      await evaluateStateAssertion(assertion, agentCtx, pireCtx, state, eventLogBaselines, invoke, {
        probeTimeoutMs,
      })
    );
  }
  return results;
}

async function evaluateStateAssertion(assertion, agentCtx, pireCtx, state, eventLogBaselines, invoke, { probeTimeoutMs }) {
  if (assertion.type === "urlContains") {
    const value = assertion.value ?? assertion.text;
    const pass = state?.agentBrowser?.url?.includes(value) && state?.pireBrowser?.url?.includes(value);
    return { type: assertion.type, pass, reason: pass ? `URL contains ${value}` : `URL missing ${value}` };
  }
  if (assertion.type === "titleContains") {
    const value = assertion.value ?? assertion.text;
    const pass = state?.agentBrowser?.title?.includes(value) && state?.pireBrowser?.title?.includes(value);
    return { type: assertion.type, pass, reason: pass ? `title contains ${value}` : `title missing ${value}` };
  }
  if (assertion.type === "domValue" || assertion.type === "domText" || assertion.type === "eventLogContains") {
    const selector = assertion.selector;
    const command = assertion.type === "domValue" ? `get value "${selector}"` : `get text "${selector}"`;
    const [agent, pire] = await Promise.all([
      invoke.safely(agentCtx, command, `assert:${assertion.type}`, { timeoutMs: probeTimeoutMs }),
      invoke.safely(pireCtx, command, `assert:${assertion.type}`, { timeoutMs: probeTimeoutMs }),
    ]);
    const expected = assertion.value ?? assertion.text;
    const agentText = agent.stdout.trim();
    const pireText = pire.stdout.trim();
    const agentComparable =
      assertion.type === "eventLogContains"
        ? textAfterBaseline(agentText, eventLogBaselines?.agentBrowser?.[selector] ?? "")
        : agentText;
    const pireComparable =
      assertion.type === "eventLogContains"
        ? textAfterBaseline(pireText, eventLogBaselines?.pireBrowser?.[selector] ?? "")
        : pireText;
    const pass =
      agent.exitCode === 0 &&
      pire.exitCode === 0 &&
      (assertion.type === "eventLogContains"
        ? agentComparable.includes(expected) && pireComparable.includes(expected)
        : agentComparable === expected && pireComparable === expected);
    return {
      type: assertion.type,
      pass,
      reason: pass
        ? `${assertion.type} matched`
        : `${assertion.type} mismatch; agent-browser=${JSON.stringify(agentComparable)}, pire-browser=${JSON.stringify(pireComparable)}`,
      agentBrowser: agent,
      pireBrowser: pire,
    };
  }
  return { type: assertion.type, pass: false, reason: `unknown state assertion: ${assertion.type}` };
}

async function captureEventLogBaselines(assertions, agentCtx, pireCtx, invoke, { probeTimeoutMs }) {
  const selectors = [...new Set(assertions.filter((assertion) => assertion.type === "eventLogContains").map((assertion) => assertion.selector))];
  if (!selectors.length) return null;
  const baselines = {
    agentBrowser: {},
    pireBrowser: {},
  };

  await Promise.all(
    selectors.flatMap((selector) => [
      invoke.safely(agentCtx, `get text "${selector}"`, `baseline:eventLog:${selector}`, { timeoutMs: probeTimeoutMs }).then((result) => {
        baselines.agentBrowser[selector] = result.exitCode === 0 ? result.stdout.trim() : "";
      }),
      invoke.safely(pireCtx, `get text "${selector}"`, `baseline:eventLog:${selector}`, { timeoutMs: probeTimeoutMs }).then((result) => {
        baselines.pireBrowser[selector] = result.exitCode === 0 ? result.stdout.trim() : "";
      }),
    ])
  );
  return baselines;
}

function textAfterBaseline(text, baseline) {
  const value = String(text ?? "");
  const start = String(baseline ?? "");
  return start && value.startsWith(start) ? value.slice(start.length) : value;
}

function applyCaptures(toolCtx, step, result) {
  const refs = captureRefsFromText(result.stdout, step.captures ?? []);
  toolCtx.refs = { ...toolCtx.refs, ...refs };
  toolCtx.captures = { ...toolCtx.captures, ...refs };
  return refs;
}

async function cleanup(toolCtx, invoke) {
  const command = toolCtx.tool === "agent-browser" ? "close --all" : "close";
  return invoke.safely(toolCtx, command, "cleanup", { showProcessWindow: false });
}
