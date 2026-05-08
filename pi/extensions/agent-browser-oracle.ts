import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type, type Static } from "typebox";
import { splitCommand } from "./pire-browser-runner";

const AgentBrowserOracleParams = Type.Object({
  command: Type.String({
    description:
      "agent-browser command string, for example: open https://example.com, snapshot -i, click @e1, fill @e2 hello.",
  }),
});

type AgentBrowserOracleInput = Static<typeof AgentBrowserOracleParams>;
let oraclePiToolCallCount = 0;

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "agent-browser-oracle",
    label: "agent-browser oracle",
    description:
      "Control the pinned vanilla agent-browser oracle. This is for parity testing against pire-browser, not normal browsing.",
    promptSnippet:
      "agent-browser-oracle: run pinned vanilla agent-browser commands for parity checks, using the same command strings as pire-browser.",
    promptGuidelines: [
      "Use agent-browser-oracle only when explicitly testing parity against pire-browser.",
      "Use agent-browser-compatible command shapes such as open <url>, snapshot -i, click @eN, fill @eN <text>, wait <selector>, and tab/tabs commands.",
      "After open/goto/navigate, run snapshot -i before interacting with refs.",
      "Do not claim success until the tool result confirms the command completed.",
    ],
    parameters: AgentBrowserOracleParams,

    async execute(_toolCallId, params: AgentBrowserOracleInput, signal) {
      const limited = enforceOraclePiToolCallLimit(params.command);
      if (limited) return limited;
      const executable = resolveExecutable();
      const args = splitCommand(params.command);
      const result = await run(executable, args, signal);
      return {
        content: [
          {
            type: "text",
            text: result.stdout || result.stderr || "agent-browser oracle command completed with no output",
          },
        ],
        details: {
          command: params.command,
          exitCode: result.exitCode,
          finishReason: result.finishReason,
          timedOut: result.timedOut,
          stderr: result.stderr,
        },
      };
    },

    renderCall(args: AgentBrowserOracleInput, theme) {
      return new Text(
        `${theme.fg("toolTitle", theme.bold("agent-browser-oracle "))}${theme.fg("muted", args.command)}`,
        0,
        0
      );
    },

    renderResult(result, _options, theme) {
      const text = result.content[0];
      const value = text?.type === "text" ? text.text : "";
      const details = result.details as { exitCode?: number; timedOut?: boolean } | undefined;
      const color = (details?.exitCode && details.exitCode !== 0) || details?.timedOut ? "error" : "muted";
      return new Text(theme.fg(color, value), 0, 0);
    },
  });
}

function enforceOraclePiToolCallLimit(command: string) {
  const max = Number.parseInt(process.env.ORACLE_PI_MAX_TOOL_CALLS ?? "", 10);
  if (!Number.isFinite(max) || max <= 0) return null;
  oraclePiToolCallCount += 1;
  if (oraclePiToolCallCount <= max) return null;
  const text = `agent-browser oracle smoke stopped after ${max} tool call(s); command was not executed: ${command}`;
  return {
    content: [{ type: "text" as const, text }],
    details: {
      command,
      exitCode: 1,
      finishReason: "tool-call-limit",
      timedOut: false,
      stderr: text,
    },
  };
}

function resolveExecutable(): string {
  const envPath = process.env.AGENT_BROWSER_ORACLE_EXE;
  if (envPath && existsSync(envPath)) return envPath;

  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const suffix = process.platform === "win32" ? ".exe" : "";
  const platformKey =
    process.platform === "win32"
      ? "win32"
      : process.platform === "darwin"
        ? "darwin"
        : process.platform === "linux"
          ? "linux"
          : process.platform;
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  const nativeNames =
    process.platform === "win32"
      ? [`agent-browser-${platformKey}-x64${suffix}`, `agent-browser-${platformKey}-arm64${suffix}`]
      : [
          `agent-browser-${platformKey}-${arch}${suffix}`,
          `agent-browser-${platformKey}-x64${suffix}`,
          `agent-browser-${platformKey}-arm64${suffix}`,
        ];
  const candidates = [
    ...[...new Set(nativeNames)].map((nativeName) =>
      join(packageRoot, "target", "agent-browser-oracle", "npm", "node_modules", "agent-browser", "bin", nativeName)
    ),
    process.platform === "win32"
      ? join(packageRoot, "target", "agent-browser-oracle", "npm", "node_modules", ".bin", "agent-browser.cmd")
      : join(packageRoot, "target", "agent-browser-oracle", "npm", "node_modules", ".bin", "agent-browser"),
    "agent-browser",
  ];
  return candidates.find((candidate) => candidate === "agent-browser" || existsSync(candidate)) ?? candidates[0];
}

type FinishReason = "close" | "exit" | "error" | "abort" | "timeout" | "output-idle";

function run(executable: string, args: string[], signal: AbortSignal) {
  return new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
    finishReason: FinishReason;
    timedOut: boolean;
  }>((resolvePromise) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let outputIdleTimer: ReturnType<typeof setTimeout> | undefined;
    const outputIdleMs = Number.parseInt(process.env.AGENT_BROWSER_ORACLE_OUTPUT_IDLE_MS ?? "1000", 10);
    const child = spawn(executable, args, { windowsHide: true });
    const finish = (result: {
      stdout: string;
      stderr: string;
      exitCode: number | null;
      finishReason: FinishReason;
      timedOut: boolean;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (outputIdleTimer) clearTimeout(outputIdleTimer);
      signal.removeEventListener("abort", onAbort);
      destroyChildOutput(child);
      resolvePromise({
        ...result,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      });
    };
    const onAbort = () => {
      try {
        child.kill();
      } catch {
        // Process may already be gone.
      }
      finish({ stdout, stderr, exitCode: null, finishReason: "abort", timedOut: false });
    };
    const scheduleOutputIdleFinish = () => {
      if (!Number.isFinite(outputIdleMs) || outputIdleMs <= 0 || settled || (!stdout && !stderr)) return;
      if (outputIdleTimer) clearTimeout(outputIdleTimer);
      outputIdleTimer = setTimeout(() => {
        finish({
          stdout,
          stderr,
          exitCode: stderr.trim() && !stdout.trim() ? 1 : 0,
          finishReason: "output-idle",
          timedOut: false,
        });
      }, outputIdleMs);
      outputIdleTimer.unref?.();
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // Process may already be gone.
      }
      finish({
        stdout,
        stderr: `${stderr}\nagent-browser oracle command timed out`.trim(),
        exitCode: 1,
        finishReason: "timeout",
        timedOut: true,
      });
    }, Number.parseInt(process.env.AGENT_BROWSER_ORACLE_TOOL_TIMEOUT_MS ?? "105000", 10));
    timer.unref?.();
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      scheduleOutputIdleFinish();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      scheduleOutputIdleFinish();
    });
    child.on("error", (error) =>
      finish({
        stdout,
        stderr: `${stderr}\n${error.message}`,
        exitCode: 1,
        finishReason: "error",
        timedOut: false,
      })
    );
    child.on("exit", (exitCode) =>
      setTimeout(
        () =>
          finish({
            stdout,
            stderr,
            exitCode: exitCode ?? 0,
            finishReason: "exit",
            timedOut: false,
          }),
        250
      )
    );
    child.on("close", (exitCode) =>
      finish({ stdout, stderr, exitCode: exitCode ?? 0, finishReason: "close", timedOut: false })
    );
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}

function destroyChildOutput(child: ReturnType<typeof spawn>) {
  try {
    child.stdout?.destroy();
  } catch {
    // The stream may already be closed.
  }
  try {
    child.stderr?.destroy();
  } catch {
    // The stream may already be closed.
  }
}
