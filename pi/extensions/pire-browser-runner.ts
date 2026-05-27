import { spawn } from "node:child_process";
import { redactDiagnosticText, redactProbe } from "./redaction";

const DEFAULT_TOOL_TIMEOUT_MS = 105_000;
const FIRST_PROBE_DELAY_MS = 20_000;
const PROBE_INTERVAL_MS = 5_000;
const PROBE_TIMEOUT_MS = 3_000;
const EXIT_DRAIN_MS = 250;

export type FinishReason = "close" | "exit" | "error" | "abort" | "timeout" | "recovered";

type ChildOutput = {
  on(event: "data", listener: (chunk: { toString(): string }) => void): unknown;
  destroy?(): unknown;
};

type ChildProcessLike = {
  stdout?: ChildOutput | null;
  stderr?: ChildOutput | null;
  kill(): unknown;
  on(event: "close" | "exit", listener: (exitCode: number | null) => void): unknown;
  on(event: "error", listener: (error: Error) => void): unknown;
};

export type SpawnCommand = (
  executable: string,
  args: string[],
  options: { windowsHide?: boolean }
) => ChildProcessLike;

export type ProbeCommandResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
};

export type ProbeResult = {
  status?: ProbeCommandResult;
  tabs?: ProbeCommandResult;
  liveSession: boolean;
  liveTabs: boolean;
  error?: string;
};

export type RunResult = {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  finishReason: FinishReason;
  timedOut: boolean;
  recovered: boolean;
  probe?: ProbeResult;
};

export type RunOptions = {
  spawnCommand?: SpawnCommand;
  toolTimeoutMs?: number;
  firstProbeDelayMs?: number;
  probeIntervalMs?: number;
  probeTimeoutMs?: number;
  exitDrainMs?: number;
};

export function splitCommand(command: string): string[] {
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
  if (quote) throw new Error(`Unclosed quote in command: ${command}`);
  if (escaping) current += "\\";
  if (current) args.push(current);
  return args;
}

export function run(
  executable: string,
  args: string[],
  signal: AbortSignal,
  options: RunOptions = {}
): Promise<RunResult> {
  return new Promise((resolvePromise) => {
    const spawnCommand: SpawnCommand =
      options.spawnCommand ??
      ((command, commandArgs, spawnOptions) => spawn(command, commandArgs, spawnOptions));
    const toolTimeoutMs = options.toolTimeoutMs ?? toolTimeoutFromEnv();
    const firstProbeDelayMs = options.firstProbeDelayMs ?? FIRST_PROBE_DELAY_MS;
    const probeIntervalMs = options.probeIntervalMs ?? PROBE_INTERVAL_MS;
    const probeTimeoutMs = options.probeTimeoutMs ?? PROBE_TIMEOUT_MS;
    const exitDrainMs = options.exitDrainMs ?? EXIT_DRAIN_MS;
    let child: ChildProcessLike;
    try {
      child = spawnCommand(executable, args, { windowsHide: true });
    } catch (error) {
      resolvePromise({
        stdout: "",
        stderr: errorMessage(error),
        exitCode: 1,
        finishReason: "error",
        timedOut: false,
        recovered: false,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;
    let exitDrainTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdogTimer: ReturnType<typeof setTimeout> | undefined;
    let probeTimer: ReturnType<typeof setTimeout> | undefined;
    let probing = false;
    let finishingProcessEnd = false;

    const cleanup = () => {
      if (exitDrainTimer) clearTimeout(exitDrainTimer);
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (probeTimer) clearTimeout(probeTimer);
      signal.removeEventListener("abort", onAbort);
      destroyChildOutput(child);
    };

    const finish = (result: RunResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolvePromise(redactRunResult(result));
    };

    const finishWithCurrentOutput = (finishReason: FinishReason, exitCode: number | null) => {
      finish({
        stdout,
        stderr,
        exitCode,
        finishReason,
        timedOut: finishReason === "timeout",
        recovered: false,
      });
    };

    const finishAfterProcessEnd = async (finishReason: Extract<FinishReason, "close" | "exit">, exitCode: number | null) => {
      if (settled || finishingProcessEnd) return;
      finishingProcessEnd = true;
      if (isRecoverableNavigationExit(args, exitCode)) {
        const probe = await probeBrowserSession(executable, signal, spawnCommand, probeTimeoutMs);
        if (settled) return;
        if (probe.liveSession) {
          finish({
            stdout: recoveredText(stdout, stderr, probe),
            stderr,
            exitCode: 0,
            finishReason: "recovered",
            timedOut: false,
            recovered: true,
            probe,
          });
          return;
        }
        finish({
          stdout,
          stderr,
          exitCode,
          finishReason,
          timedOut: false,
          recovered: false,
          probe,
        });
        return;
      }
      finishWithCurrentOutput(finishReason, exitCode);
    };

    const onAbort = () => {
      killChild(child);
      finishWithCurrentOutput("abort", null);
    };

    const scheduleTimer = (callback: () => void, ms: number) => {
      const timer = setTimeout(callback, ms);
      (timer as { unref?: () => void }).unref?.();
      return timer;
    };

    const startRecoveryProbe = () => {
      if (!isNavigationCommand(args)) return;
      probeTimer = scheduleTimer(runRecoveryProbe, firstProbeDelayMs);
    };

    const scheduleNextProbe = () => {
      if (settled || !isNavigationCommand(args)) return;
      probeTimer = scheduleTimer(runRecoveryProbe, probeIntervalMs);
    };

    const runRecoveryProbe = async () => {
      if (settled || probing) return;
      probing = true;
      try {
        const probe = await probeBrowserSession(executable, signal, spawnCommand, probeTimeoutMs);
        if (settled) return;
        if (probe.liveSession) {
          killChild(child);
          finish({
            stdout: recoveredText(stdout, stderr, probe),
            stderr,
            exitCode: 0,
            finishReason: "recovered",
            timedOut: false,
            recovered: true,
            probe,
          });
          return;
        }
      } finally {
        probing = false;
      }
      scheduleNextProbe();
    };

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    signal.addEventListener("abort", onAbort, { once: true });
    child.on("close", (exitCode) => {
      void finishAfterProcessEnd("close", exitCode);
    });
    child.on("exit", (exitCode) => {
      if (settled) return;
      exitDrainTimer = scheduleTimer(() => {
        void finishAfterProcessEnd("exit", exitCode);
      }, exitDrainMs);
    });
    child.on("error", (error) =>
      finish({
        stdout,
        stderr: `${stderr}\n${error.message}`,
        exitCode: 1,
        finishReason: "error",
        timedOut: false,
        recovered: false,
      })
    );

    if (signal.aborted) {
      onAbort();
      return;
    }

    startRecoveryProbe();
    watchdogTimer = scheduleTimer(async () => {
      if (settled) return;
      let probe: ProbeResult | undefined;
      if (isNavigationCommand(args)) {
        probe = await probeBrowserSession(executable, signal, spawnCommand, probeTimeoutMs);
        if (settled) return;
        if (probe.liveSession) {
          killChild(child);
          finish({
            stdout: recoveredText(stdout, stderr, probe),
            stderr,
            exitCode: 0,
            finishReason: "recovered",
            timedOut: false,
            recovered: true,
            probe,
          });
          return;
        }
      }
      killChild(child);
      finish({
        stdout,
        stderr: `${stderr}\npire-browser command timed out after ${toolTimeoutMs}ms`.trim(),
        exitCode: 1,
        finishReason: "timeout",
        timedOut: true,
        recovered: false,
        probe,
      });
    }, toolTimeoutMs);
  });
}

function toolTimeoutFromEnv(): number {
  const value = Number.parseInt(process.env.PIRE_BROWSER_TOOL_TIMEOUT_MS ?? "", 10);
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_TOOL_TIMEOUT_MS;
}

function redactRunResult(result: RunResult): RunResult {
  const stdout = result.stdout.trim();
  return {
    ...result,
    stdout: result.recovered ? redactDiagnosticText(stdout) : stdout,
    stderr: redactDiagnosticText(result.stderr.trim()),
    probe: result.probe ? redactProbe(result.probe) : undefined,
  };
}

function isNavigationCommand(args: string[]): boolean {
  return ["open", "goto", "navigate"].includes(args[0] ?? "");
}

function isRecoverableNavigationExit(args: string[], exitCode: number | null): boolean {
  return isNavigationCommand(args) && exitCode !== 0;
}

async function probeBrowserSession(
  executable: string,
  signal: AbortSignal,
  spawnCommand: SpawnCommand,
  timeoutMs: number
): Promise<ProbeResult> {
  if (signal.aborted) {
    return { liveSession: false, liveTabs: false, error: "aborted" };
  }

  const status = await runProbeCommand(executable, ["status"], signal, spawnCommand, timeoutMs);
  const liveSession = status.exitCode === 0 && hasLiveSession(status.stdout);
  const probe: ProbeResult = { status, liveSession, liveTabs: false };
  if (!liveSession || signal.aborted) return probe;

  const tabs = await runProbeCommand(executable, ["tabs", "list"], signal, spawnCommand, timeoutMs);
  probe.tabs = tabs;
  probe.liveTabs = tabs.exitCode === 0 && hasLiveTabs(tabs.stdout);
  return probe;
}

function runProbeCommand(
  executable: string,
  args: string[],
  signal: AbortSignal,
  spawnCommand: SpawnCommand,
  timeoutMs: number
): Promise<ProbeCommandResult> {
  return new Promise((resolvePromise) => {
    let child: ChildProcessLike;
    try {
      child = spawnCommand(executable, args, { windowsHide: true });
    } catch (error) {
      resolvePromise({
        stdout: "",
        stderr: errorMessage(error),
        exitCode: 1,
        timedOut: false,
      });
      return;
    }
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: ProbeCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      destroyChildOutput(child);
      resolvePromise({
        ...result,
        stdout: result.stdout.trim(),
        stderr: result.stderr.trim(),
      });
    };

    const onAbort = () => {
      killChild(child);
      finish({ stdout, stderr: `${stderr}\nprobe aborted`, exitCode: 1, timedOut: false });
    };

    const timer = setTimeout(() => {
      killChild(child);
      finish({ stdout, stderr: `${stderr}\nprobe timed out after ${timeoutMs}ms`, exitCode: 1, timedOut: true });
    }, timeoutMs);
    (timer as { unref?: () => void }).unref?.();

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    signal.addEventListener("abort", onAbort, { once: true });
    child.on("close", (exitCode) => finish({ stdout, stderr, exitCode, timedOut: false }));
    child.on("exit", (exitCode) => {
      setTimeout(() => finish({ stdout, stderr, exitCode, timedOut: false }), EXIT_DRAIN_MS);
    });
    child.on("error", (error) =>
      finish({ stdout, stderr: `${stderr}\n${error.message}`, exitCode: 1, timedOut: false })
    );

    if (signal.aborted) onAbort();
  });
}

function hasLiveSession(stdout: string): boolean {
  return /\b[1-9]\d*\s+live pire-browser session\(s\)/i.test(stdout);
}

function hasLiveTabs(stdout: string): boolean {
  const text = stdout.trim();
  return text.length > 0 && !/No tabs tracked/i.test(text);
}

function recoveredText(stdout: string, stderr: string, probe: ProbeResult): string {
  return [
    "Recovered after auto-launch; Firefox session is live.",
    formatProbeRecoveryText(probe),
    stdout.trim() ? `Original command output:\n${stdout.trim()}` : "",
    stderr.trim() ? `Original command stderr:\n${stderr.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatProbeRecoveryText(probe: ProbeResult): string {
  const status = probe.status?.stdout ? `status:\n${probe.status.stdout}` : "";
  const tabs = probe.tabs?.stdout ? `tabs list:\n${probe.tabs.stdout}` : "";
  return [status, tabs].filter(Boolean).join("\n\n");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function killChild(child: ReturnType<SpawnCommand>) {
  try {
    child.kill();
  } catch {
    // The process may already be gone.
  }
}

function destroyChildOutput(child: ChildProcessLike) {
  try {
    child.stdout?.destroy?.();
  } catch {
    // The stream may already be closed.
  }
  try {
    child.stderr?.destroy?.();
  } catch {
    // The stream may already be closed.
  }
}
