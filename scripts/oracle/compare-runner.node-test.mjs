import assert from "node:assert/strict";
import test from "node:test";
import { runOracleCases } from "./compare-runner.mjs";

const baseOptions = {
  agentBrowser: "agent-browser",
  pireBrowser: "pire-browser",
  fixtureUrl: "http://fixture.test",
  oracleRoot: "C:\\oracle",
  runLogDir: "C:\\oracle\\logs",
  timeoutMs: 1000,
  probeTimeoutMs: 100,
};

test("runner probes url and title only when assertions need them", async () => {
  const calls = [];
  const runCommandImpl = async (_executable, args, options) => {
    const command = args.join(" ");
    calls.push({ command, options });
    if (command.includes("get url")) return result("http://fixture.test/form.html\n");
    if (command.includes("get title")) throw new Error("title probe should not run");
    return result("ok\n");
  };

  const [caseRecord] = await runOracleCases({
    ...baseOptions,
    runCommandImpl,
    cases: [
      {
        id: "lazy-probes",
        bail: true,
        steps: [
          { id: "plain", command: "status", assertions: [{ type: "exitCodeEquals", value: 0 }] },
          { id: "url", command: "status", assertions: [{ type: "urlContains", value: "/form.html" }] },
        ],
        finalAssertions: [],
      },
    ],
  });

  assert.equal(caseRecord.pass, true);
  assert.equal(calls.filter((call) => call.command.includes("get url")).length, 2);
  assert.equal(calls.filter((call) => call.command.includes("get title")).length, 0);
  assert.equal(caseRecord.steps[0].state, null);
  assert.ok(caseRecord.steps[1].state);
});

test("runner shows only visible step commands during visible runs", async () => {
  const calls = [];
  const runCommandImpl = async (_executable, args, options) => {
    const command = args.join(" ");
    calls.push({ command, options });
    if (command.includes("get value")) return result("hello\n");
    return result("ok\n");
  };

  const [caseRecord] = await runOracleCases({
    ...baseOptions,
    visibleRun: true,
    runCommandImpl,
    cases: [
      {
        id: "visible-hidden-probes",
        bail: true,
        steps: [
          {
            id: "fill",
            command: "fill \"#email\" hello",
            assertions: [{ type: "domValue", selector: "#email", value: "hello" }],
          },
        ],
        finalAssertions: [],
      },
    ],
  });

  assert.equal(caseRecord.pass, true);
  assert.ok(calls.filter((call) => call.command.includes("fill")).every((call) => call.options.windowsHide === false));
  assert.ok(calls.filter((call) => call.command.includes("get value")).every((call) => call.options.windowsHide === true));
  assert.ok(calls.filter((call) => call.command.includes("close")).every((call) => call.options.windowsHide === true));
});

test("runner defaults to bailing after the first failed step", async () => {
  const calls = [];
  const runCommandImpl = async (_executable, args) => {
    const command = args.join(" ");
    calls.push(command);
    return command.includes("bad") ? result("", 1) : result("ok\n");
  };

  const [caseRecord] = await runOracleCases({
    ...baseOptions,
    runCommandImpl,
    cases: [
      {
        id: "default-bail",
        steps: [
          { id: "bad", command: "bad", assertions: [{ type: "exitCodeEquals", value: 0 }] },
          { id: "after", command: "after", assertions: [{ type: "exitCodeEquals", value: 0 }] },
        ],
        finalAssertions: [],
      },
    ],
  });

  assert.equal(caseRecord.pass, false);
  assert.equal(calls.some((command) => command.includes("after")), false);
});

test("runner honors bail false opt-out", async () => {
  const calls = [];
  const runCommandImpl = async (_executable, args) => {
    const command = args.join(" ");
    calls.push(command);
    return command.includes("bad") ? result("", 1) : result("ok\n");
  };

  const [caseRecord] = await runOracleCases({
    ...baseOptions,
    runCommandImpl,
    cases: [
      {
        id: "no-bail",
        bail: false,
        steps: [
          { id: "bad", command: "bad", assertions: [{ type: "exitCodeEquals", value: 0 }] },
          { id: "after", command: "after", assertions: [{ type: "exitCodeEquals", value: 0 }] },
        ],
        finalAssertions: [],
      },
    ],
  });

  assert.equal(caseRecord.pass, false);
  assert.equal(calls.some((command) => command.includes("after")), true);
});

test("runner retries agent-browser daemon version restart once", async () => {
  let agentOpenCalls = 0;
  const runCommandImpl = async (executable, args) => {
    const command = args.join(" ");
    if (executable === "agent-browser" && command.includes("open ")) {
      agentOpenCalls += 1;
      if (agentOpenCalls === 1) {
        return { ...result("", 1), stderr: "Daemon version mismatch detected, restarting...\n", finishReason: "output-idle", outputIdle: true };
      }
      return result("opened\n");
    }
    return result("ok\n");
  };

  const [caseRecord] = await runOracleCases({
    ...baseOptions,
    runCommandImpl,
    cases: [
      {
        id: "daemon-retry",
        steps: [{ id: "open", command: "open {{fixtureUrl}}/form.html", assertions: [{ type: "exitCodeEquals", value: 0 }] }],
        finalAssertions: [],
      },
    ],
  });

  assert.equal(caseRecord.pass, true);
  assert.equal(agentOpenCalls, 2);
  assert.equal(caseRecord.steps[0].agentBrowser.adapterRetry, "agent-browser-daemon-version-mismatch");
});

test("runner uses a caller-provided per-run LOCALAPPDATA for pire-browser", async () => {
  const calls = [];
  const perRunLocalAppData = "C:\\oracle\\runs\\run-1\\pire-local-app-data";
  const runCommandImpl = async (executable, args, options) => {
    calls.push({ executable, args, options });
    return result("ok\n");
  };

  const [caseRecord] = await runOracleCases({
    ...baseOptions,
    pireLocalAppDataRoot: perRunLocalAppData,
    runCommandImpl,
    cases: [
      {
        id: "per-run-app-data",
        steps: [{ id: "status", command: "status", assertions: [{ type: "exitCodeEquals", value: 0 }] }],
        finalAssertions: [],
      },
    ],
  });

  assert.equal(caseRecord.pass, true);
  const pireCalls = calls.filter((call) => call.executable === "pire-browser");
  assert.ok(pireCalls.length > 0);
  assert.ok(pireCalls.every((call) => call.options.env.LOCALAPPDATA === perRunLocalAppData));
});

test("runner uses profile-backed --session-name for named pire-browser oracle mode", async () => {
  const calls = [];
  const runCommandImpl = async (executable, args, options) => {
    calls.push({ executable, args, options });
    return { ...result("ok\n"), args };
  };

  const [caseRecord] = await runOracleCases({
    ...baseOptions,
    env: { ...process.env, PIRE_BROWSER_ORACLE_NAMED_SESSION: "1" },
    runCommandImpl,
    cases: [
      {
        id: "named-pire-mode",
        steps: [{ id: "open", command: "open {{fixtureUrl}}/form.html", assertions: [{ type: "exitCodeEquals", value: 0 }] }],
        finalAssertions: [],
      },
    ],
  });

  assert.equal(caseRecord.pass, true);
  const pireCalls = calls.filter((call) => call.executable === "pire-browser");
  assert.ok(pireCalls.length > 0);
  assert.ok(pireCalls.every((call) => call.args[0] === "--session-name"));
  assert.equal(caseRecord.cleanup.pireBrowser.args[0], "--session-name");
});

test("eventLogContains only matches events emitted after step start", async () => {
  let eventReadCount = 0;
  const runCommandImpl = async (_executable, args) => {
    const command = args.join(" ");
    if (command.includes("get text") && command.includes("#events")) {
      eventReadCount += 1;
      return result("old-event\n");
    }
    return result("ok\n");
  };

  const [caseRecord] = await runOracleCases({
    ...baseOptions,
    runCommandImpl,
    cases: [
      {
        id: "event-delta",
        bail: true,
        steps: [
          {
            id: "noop",
            command: "status",
            assertions: [{ type: "eventLogContains", selector: "#events", value: "old-event" }],
          },
        ],
        finalAssertions: [],
      },
    ],
  });

  assert.equal(eventReadCount, 4);
  assert.equal(caseRecord.pass, false);
  assert.match(caseRecord.reason, /eventLogContains mismatch/);
});

function result(stdout, exitCode = 0) {
  return {
    args: [],
    stdout,
    stderr: "",
    exitCode,
    durationMs: 1,
    finishReason: "close",
    timedOut: false,
  };
}
