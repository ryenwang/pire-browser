import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type, type Static } from "typebox";
import { run, splitCommand, type FinishReason } from "./pire-browser-runner";
import { redactDiagnosticText, redactProbe } from "./redaction";

const PireBrowserParams = Type.Object({
  command: Type.String({
    description:
      "pire-browser command string, for example: status --json, doctor, skills get core, open, open https://example.com, snapshot, get title, is visible '@e4', click '@e4', upload '#file' ./fixture.txt, or find label Email fill hello@example.com. The CLI auto-launches Firefox for browser commands when no live session exists.",
  }),
});

type PireBrowserInput = Static<typeof PireBrowserParams>;
let smokePiToolCallCount = 0;

export default function (pi: ExtensionAPI) {
  const register = (name: "pire-browser" | "pire_browser") =>
    pi.registerTool({
      name,
      label: "pire-browser",
      description:
        "Control the user's Firefox browser through the pire-browser Firefox extension and native host.",
      promptSnippet:
        "pire-browser: control the user's Firefox browser. For full version-matched guidance, run `pire-browser skills get core`.",
      promptGuidelines: [
        "Use pire-browser when the user asks to open, inspect, or interact with web pages in Firefox.",
        "Run `pire-browser skills get core` for quickstart recipes; use `pire-browser open` with no URL to launch or reuse Firefox before staging state, cookies, routes, or init scripts.",
        "Inspect with `pire-browser snapshot --compact` before page actions, use fresh quoted refs such as `click '@e4'`, and use `get`/`is` for targeted verification.",
        "If navigation is recovered or returns a page-readiness warning, continue with `pire-browser snapshot`.",
        "Do not claim a pire-browser action succeeded until the pire-browser tool result confirms success.",
        "If pire-browser returns `confirm <id>` or ConfirmationRequired, ask the user before running the provided confirm command.",
        "If pire-browser returns an error, report the error and next corrective step instead of saying the page was opened or changed.",
      ],
      parameters: PireBrowserParams,

      async execute(_toolCallId, params: PireBrowserInput, signal) {
        const limited = enforcePiToolCallLimit(params.command);
        if (limited) return limited;
        const command = resolveCommand();
        const args = splitCommand(params.command);
        const result = await run(command.executable, [...command.args, ...args], signal);
        const stderr = redactDiagnosticText(result.stderr);
        const text = result.stdout || stderr || "pire-browser command completed with no output";
        const isError = isErroredResult(text, result);
        return {
          content: [
            {
              type: "text",
              text,
            },
          ],
          details: {
            command: redactDiagnosticText(params.command),
            exitCode: result.exitCode,
            finishReason: result.finishReason,
            timedOut: result.timedOut,
            recovered: result.recovered,
            stderr,
            probe: result.probe ? redactProbe(result.probe) : undefined,
          },
          isError,
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
          !isConfirmationRequiredResult(value, details) &&
          ((details?.exitCode && details.exitCode !== 0) || details?.finishReason === "timeout")
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

export function isConfirmationRequiredResult(
  text: string,
  details?: { exitCode?: number | null; finishReason?: FinishReason | "tool-call-limit" }
) {
  if (details?.exitCode === 75) return true;
  if (text.includes("ConfirmationRequired")) return true;
  try {
    const parsed = JSON.parse(text);
    return parsed?.error?.code === "ConfirmationRequired";
  } catch {
    return false;
  }
}

function isErroredResult(
  text: string,
  details: { exitCode?: number | null; finishReason?: FinishReason | "tool-call-limit"; recovered?: boolean }
) {
  if (isConfirmationRequiredResult(text, details)) return false;
  if (details.recovered) return false;
  if (details.finishReason === "timeout" || details.finishReason === "tool-call-limit") return true;
  return Boolean(details.exitCode && details.exitCode !== 0);
}

function enforcePiToolCallLimit(command: string) {
  const max = Number.parseInt(process.env.PIRE_BROWSER_PI_MAX_TOOL_CALLS ?? "", 10);
  if (!Number.isFinite(max) || max <= 0) return null;
  smokePiToolCallCount += 1;
  if (smokePiToolCallCount <= max) return null;
  const text = `pire-browser smoke stopped after ${max} tool call(s); command was not executed: ${command}`;
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
    isError: true,
  };
}

function resolveCommand(): { executable: string; args: string[] } {
  const envPath = process.env.PIRE_BROWSER_EXE;
  if (envPath && existsSync(envPath)) return { executable: envPath, args: [] };
  const envBinary = process.env.PIRE_BROWSER_BINARY;
  if (envBinary && existsSync(envBinary)) return { executable: envBinary, args: [] };

  const suffix = process.platform === "win32" ? ".exe" : "";
  const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const launcher = join(packageRoot, "bin", "pire-browser.js");
  if (existsSync(launcher)) return { executable: process.execPath, args: [launcher] };
  const candidates = [
    join(packageRoot, "bin", "win32-x64", `pire-browser${suffix}`),
    join(process.cwd(), "target", "debug", `pire-browser${suffix}`),
    join(process.cwd(), "target", "release", `pire-browser${suffix}`),
    `pire-browser${suffix}`,
  ];
  const executable =
    candidates.find((candidate) => candidate === `pire-browser${suffix}` || existsSync(candidate)) ?? candidates[0];
  return { executable, args: [] };
}
