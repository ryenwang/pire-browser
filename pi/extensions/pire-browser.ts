import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Text } from "@mariozechner/pi-tui";
import { Type, type Static } from "typebox";

const PireBrowserParams = Type.Object({
  command: Type.String({
    description:
      "pire-browser command string, for example: open https://example.com, snapshot -i, find label Email fill hello@example.com",
  }),
});

type PireBrowserInput = Static<typeof PireBrowserParams>;

export default function (pi: ExtensionAPI) {
  const register = (name: "pire-browser" | "pire_browser") =>
    pi.registerTool({
      name,
    label: "pire-browser",
    description:
      "Control the user's Firefox browser through the pire-browser Firefox extension and native host.",
    parameters: PireBrowserParams,

    async execute(_toolCallId, params: PireBrowserInput, signal) {
      const executable = resolveExecutable();
      const args = splitCommand(params.command);
      const result = await run(executable, args, signal);
      return {
        content: [{ type: "text", text: result.stdout || result.stderr }],
        details: {
          command: params.command,
          exitCode: result.exitCode,
          stderr: result.stderr,
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
      const details = result.details as { exitCode?: number } | undefined;
      const color = details?.exitCode && details.exitCode !== 0 ? "error" : "muted";
      return new Text(theme.fg(color, value), 0, 0);
    },
    });

  try {
    register("pire-browser");
  } catch {
    register("pire_browser");
  }
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
  return candidates.find((candidate) => candidate === `pire-browser${suffix}` || existsSync(candidate)) ?? candidates[0];
}

function splitCommand(command: string): string[] {
  const args: string[] = [];
  let current = "";
  let quote: "'" | '"' | undefined;
  let escaping = false;
  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        args.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) args.push(current);
  return args;
}

function run(
  executable: string,
  args: string[],
  signal: AbortSignal
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolvePromise) => {
    const child = spawn(executable, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    signal.addEventListener("abort", () => child.kill(), { once: true });
    child.on("close", (exitCode) => resolvePromise({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode }));
    child.on("error", (error) =>
      resolvePromise({ stdout, stderr: `${stderr}\n${error.message}`.trim(), exitCode: 1 })
    );
  });
}
