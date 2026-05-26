import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type, type Static } from "typebox";
import { run, splitCommand, type FinishReason } from "./pire-browser-runner";

const PireBrowserParams = Type.Object({
  command: Type.String({
    description:
      "pire-browser command string, for example: status --json, doctor, open https://example.com, snapshot -i, click '@e4', or find label Email fill hello@example.com. The CLI auto-launches Firefox for browser commands when no live session exists.",
  }),
});

type PireBrowserInput = Static<typeof PireBrowserParams>;
let oraclePiToolCallCount = 0;

export default function (pi: ExtensionAPI) {
  const register = (name: "pire-browser" | "pire_browser") =>
    pi.registerTool({
      name,
      label: "pire-browser",
      description:
        "Control the user's Firefox browser through the pire-browser Firefox extension and native host.",
      promptSnippet:
        "pire-browser: control the user's Firefox browser with commands such as status --json, doctor, help <topic>, open <url>, snapshot -i, find, click, fill, press, scroll, wait, screenshot, and tabs list/select/close.",
      promptGuidelines: [
        "Use pire-browser when the user asks to open, inspect, or interact with web pages in Firefox.",
        "Use `pire-browser doctor` for setup/PATH diagnostics and `pire-browser status --json` when you need structured live-session and default-target information.",
        "It is valid for the first browser action to be `pire-browser open <url>`; the CLI auto-launches Firefox when no live session exists.",
        "After a successful or recovered open/goto/navigate result, use `pire-browser snapshot -i` to inspect the page before interacting with it.",
        "Prefer agent-browser-compatible command shapes: `tab`, `get`, `is`, `type`, `find role ...`, CSS selectors, and fresh quoted `@eN` refs from `snapshot -i`, such as `click '@e4'`.",
        "For textboxes that have no visible label/name/placeholder, use either the fresh snapshot ref or `find role textbox fill <text>`; do not invent old refs after a new snapshot.",
        "Do not claim a pire-browser action succeeded until the pire-browser tool result confirms success.",
        "If pire-browser returns an error, report the error and the next corrective step instead of saying the page was opened or changed.",
      ],
      parameters: PireBrowserParams,

      async execute(_toolCallId, params: PireBrowserInput, signal) {
        const limited = enforceOraclePiToolCallLimit(params.command);
        if (limited) return limited;
        const executable = resolveExecutable();
        const args = splitCommand(params.command);
        const result = await run(executable, args, signal);
        return {
          content: [
            {
              type: "text",
              text: result.stdout || result.stderr || "pire-browser command completed with no output",
            },
          ],
          details: {
            command: params.command,
            exitCode: result.exitCode,
            finishReason: result.finishReason,
            timedOut: result.timedOut,
            recovered: result.recovered,
            stderr: result.stderr,
            probe: result.probe,
          },
        };
      },

      renderCall(args: PireBrowserInput, theme) {
        return new Text(
          `${theme.fg("toolTitle", theme.bold("pire-browser "))}${theme.fg("muted", args.command)}`,
          0,
          0
        );
      },

      renderResult(result, _options, theme) {
        const text = result.content[0];
        const value = text?.type === "text" ? text.text : "";
        const details = result.details as { exitCode?: number; finishReason?: FinishReason | "tool-call-limit" } | undefined;
        const color =
          (details?.exitCode && details.exitCode !== 0) || details?.finishReason === "timeout"
            ? "error"
            : "muted";
        return new Text(theme.fg(color, value), 0, 0);
      },
    });

  try {
    register("pire-browser");
  } catch {
    register("pire_browser");
  }
}

function enforceOraclePiToolCallLimit(command: string) {
  const max = Number.parseInt(process.env.ORACLE_PI_MAX_TOOL_CALLS ?? "", 10);
  if (!Number.isFinite(max) || max <= 0) return null;
  oraclePiToolCallCount += 1;
  if (oraclePiToolCallCount <= max) return null;
  const text = `pire-browser oracle smoke stopped after ${max} tool call(s); command was not executed: ${command}`;
  return {
    content: [{ type: "text" as const, text }],
    details: {
      command,
      exitCode: 1,
      finishReason: "tool-call-limit",
      timedOut: false,
      recovered: false,
      stderr: text,
    },
  };
}

function resolveExecutable(): string {
  const envPath = process.env.PIRE_BROWSER_EXE;
  if (envPath && existsSync(envPath)) return envPath;

  const suffix = process.platform === "win32" ? ".exe" : "";
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const candidates = [
    join(packageRoot, "bin", "win32-x64", `pire-browser${suffix}`),
    join(process.cwd(), "target", "debug", `pire-browser${suffix}`),
    join(process.cwd(), "target", "release", `pire-browser${suffix}`),
    `pire-browser${suffix}`,
  ];
  return (
    candidates.find((candidate) => candidate === `pire-browser${suffix}` || existsSync(candidate)) ?? candidates[0]
  );
}
