import { mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  REPO_ROOT,
  createRunDir,
  resolveAgentBrowserExecutable,
  resolvePireExecutable,
  runCommand,
  startFixtureServer,
  verifyInstalledAgentBrowserVersion,
  writeJson,
} from "./oracle-lib.mjs";
import { redactDiagnosticText } from "./redaction.mjs";

const shouldRun =
  process.env.ORACLE_PI_RUN === "1" ||
  Boolean(
    process.env.OPENAI_API_KEY ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.AI_GATEWAY_API_KEY ||
      process.env.ORACLE_PI_ALLOW_CONFIG
  );

if (!shouldRun) {
  console.log(
    "Skipping Pi oracle smoke: set ORACLE_PI_RUN=1 or provide a provider API key/config to run model-backed Pi checks."
  );
  process.exit(0);
}

verifyInstalledAgentBrowserVersion();
const runDir = createRunDir("pi");
mkdirSync(runDir, { recursive: true });

const fixture = await startFixtureServer();
const agentBrowserExe = resolveAgentBrowserExecutable();
const pireBrowserExe = resolvePireExecutable();
const maxToolCalls = Number.parseInt(process.env.ORACLE_PI_MAX_TOOL_CALLS ?? "8", 10);

async function runPiToolSmoke(toolName, extensionPath, executableEnvName, executablePath) {
  const toolRunDir = join(runDir, toolName);
  mkdirSync(toolRunDir, { recursive: true });
  const prompt = [
    `Use ${toolName} only.`,
    `Use at most ${maxToolCalls} browser tool calls. If the task cannot complete by then, stop and report the last tool result.`,
    `Run these browser commands in order against ${fixture.url}/form.html:`,
    "open the URL",
    "snapshot -i",
    "fill the Email textbox with pi-smoke@example.com",
    "click the Submit button",
    "wait for #done:not([hidden])",
    "Report only whether every tool result succeeded.",
  ].join("\n");
  return runCommand(
    "pi",
    [
      "--print",
      "--mode",
      "json",
      "--no-builtin-tools",
      "--no-extensions",
      "--extension",
      extensionPath,
      "--tools",
      toolName,
      prompt,
    ],
    {
      cwd: REPO_ROOT,
      timeoutMs: Number.parseInt(process.env.ORACLE_PI_TIMEOUT_MS ?? "180000", 10),
      env: {
        [executableEnvName]: executablePath,
        LOCALAPPDATA: join(toolRunDir, "local-app-data"),
        PI_CODING_AGENT_SESSION_DIR: join(toolRunDir, "pi-sessions"),
        AGENT_BROWSER_PROFILE: join(toolRunDir, "agent-browser-profile"),
        AGENT_BROWSER_SOCKET_DIR: join(toolRunDir, "agent-browser-sockets"),
        AGENT_BROWSER_ORACLE_OUTPUT_IDLE_MS: "1000",
        ORACLE_PI_MAX_TOOL_CALLS: String(maxToolCalls),
      },
    }
  );
}

try {
  const agentResult = await runPiToolSmoke(
    "agent-browser-oracle",
    join(REPO_ROOT, "pi", "extensions", "agent-browser-oracle.ts"),
    "AGENT_BROWSER_ORACLE_EXE",
    agentBrowserExe
  );
  const pireResult = await runPiToolSmoke(
    "pire-browser",
    join(REPO_ROOT, "pi", "extensions", "pire-browser.ts"),
    "PIRE_BROWSER_EXE",
    pireBrowserExe
  );
  const summary = {
    runDir,
    fixtureUrl: fixture.url,
    maxToolCalls,
    agentBrowser: {
      exitCode: agentResult.exitCode,
      stdout: redactDiagnosticText(agentResult.stdout),
      stderr: redactDiagnosticText(agentResult.stderr),
      timedOut: agentResult.timedOut,
    },
    pireBrowser: {
      exitCode: pireResult.exitCode,
      stdout: redactDiagnosticText(pireResult.stdout),
      stderr: redactDiagnosticText(pireResult.stderr),
      timedOut: pireResult.timedOut,
    },
  };
  summary.pass = agentResult.exitCode === 0 && pireResult.exitCode === 0;
  await writeJson(join(runDir, "summary.json"), summary);
  console.log(`Pi oracle smoke ${summary.pass ? "passed" : "failed"}: ${runDir}`);
  process.exit(summary.pass ? 0 : 1);
} finally {
  await fixture.close();
}
