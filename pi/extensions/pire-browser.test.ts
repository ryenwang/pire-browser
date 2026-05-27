import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { run } from "./pire-browser-runner";

type FakeSpawnCall = {
  args: string[];
  child: FakeChild;
};

class FakeStream extends EventEmitter {
  destroyed = false;

  destroy() {
    this.destroyed = true;
  }
}

class FakeChild extends EventEmitter {
  stdout = new FakeStream();
  stderr = new FakeStream();
  killed = false;

  kill() {
    this.killed = true;
    return true;
  }
}

function createSpawn(handler?: (call: FakeSpawnCall) => void) {
  const calls: FakeSpawnCall[] = [];
  const spawnCommand = (_executable: string, args: readonly string[]) => {
    const child = new FakeChild();
    const call = { args: [...args], child };
    calls.push(call);
    handler?.(call);
    return child;
  };
  return { calls, spawnCommand };
}

describe("pire-browser Pi runner", () => {
  it("settles on exit if close never arrives", async () => {
    const controller = new AbortController();
    const { calls, spawnCommand } = createSpawn((call) => {
      queueMicrotask(() => {
        call.child.stdout.emit("data", "done");
        call.child.emit("exit", 0);
      });
    });

    const result = await run("pire-browser", ["status"], controller.signal, {
      spawnCommand,
      exitDrainMs: 1,
      toolTimeoutMs: 500,
    });

    expect(calls).toHaveLength(1);
    expect(result).toMatchObject({
      stdout: "done",
      exitCode: 0,
      finishReason: "exit",
      timedOut: false,
      recovered: false,
    });
    expect(calls[0].child.stdout.destroyed).toBe(true);
    expect(calls[0].child.stderr.destroyed).toBe(true);
  });

  it("recovers a navigation command when probing finds a live session", async () => {
    const controller = new AbortController();
    const { calls, spawnCommand } = createSpawn((call) => {
      if (call.args[0] === "status") {
        queueMicrotask(() => {
          call.child.stdout.emit("data", "1 live pire-browser session(s):\nabc");
          call.child.emit("close", 0);
        });
      }
      if (call.args[0] === "tabs") {
        queueMicrotask(() => {
          call.child.stdout.emit("data", "t1 Example https://example.com");
          call.child.emit("close", 0);
        });
      }
    });

    const result = await run("pire-browser", ["open", "https://example.com"], controller.signal, {
      spawnCommand,
      firstProbeDelayMs: 1,
      probeIntervalMs: 5,
      probeTimeoutMs: 100,
      toolTimeoutMs: 500,
    });

    expect(calls.map((call) => call.args.join(" "))).toEqual([
      "open https://example.com",
      "status",
      "tabs list",
    ]);
    expect(calls[0].child.killed).toBe(true);
    expect(result).toMatchObject({
      exitCode: 0,
      finishReason: "recovered",
      timedOut: false,
      recovered: true,
    });
    expect(result.stdout).toContain("Recovered after auto-launch");
    expect(result.probe?.liveSession).toBe(true);
    expect(result.probe?.liveTabs).toBe(true);
  });

  it("detects live sessions in richer status output", async () => {
    const controller = new AbortController();
    const { calls, spawnCommand } = createSpawn((call) => {
      if (call.args[0] === "open") return;
      if (call.args[0] === "status") {
        queueMicrotask(() => {
          call.child.stdout.emit(
            "data",
            [
              "1 live pire-browser session(s):",
              "Default target: abc",
              "- abc profile=Default extension=0.1.5 heartbeat=1 focused=1",
              "  active: t1 Docs - https://example.com",
            ].join("\n")
          );
          call.child.emit("close", 0);
        });
      }
      if (call.args[0] === "tabs") {
        queueMicrotask(() => {
          call.child.stdout.emit("data", "t1 * Docs https://example.com");
          call.child.emit("close", 0);
        });
      }
    });

    const result = await run("pire-browser", ["open", "https://example.com"], controller.signal, {
      spawnCommand,
      firstProbeDelayMs: 1,
      probeIntervalMs: 5,
      probeTimeoutMs: 100,
      toolTimeoutMs: 500,
    });

    expect(calls.map((call) => call.args.join(" "))).toEqual([
      "open https://example.com",
      "status",
      "tabs list",
    ]);
    expect(result.recovered).toBe(true);
    expect(result.probe?.liveSession).toBe(true);
  });

  it("recovers a navigation command that exits nonzero after Firefox launched", async () => {
    const controller = new AbortController();
    const { calls, spawnCommand } = createSpawn((call) => {
      if (call.args[0] === "open") {
        queueMicrotask(() => {
          call.child.stderr.emit("data", "command_failed: timeout waiting for page load");
          call.child.emit("exit", 1);
        });
      }
      if (call.args[0] === "status") {
        queueMicrotask(() => {
          call.child.stdout.emit("data", "1 live pire-browser session(s):\nabc");
          call.child.emit("close", 0);
        });
      }
      if (call.args[0] === "tabs") {
        queueMicrotask(() => {
          call.child.stdout.emit("data", "t1 * Search - Microsoft Bing");
          call.child.emit("close", 0);
        });
      }
    });

    const result = await run("pire-browser", ["open", "https://www.bing.com"], controller.signal, {
      spawnCommand,
      exitDrainMs: 1,
      probeTimeoutMs: 100,
      toolTimeoutMs: 500,
    });

    expect(calls.map((call) => call.args.join(" "))).toEqual([
      "open https://www.bing.com",
      "status",
      "tabs list",
    ]);
    expect(result).toMatchObject({
      exitCode: 0,
      finishReason: "recovered",
      timedOut: false,
      recovered: true,
    });
    expect(result.stdout).toContain("Recovered after auto-launch");
    expect(result.stdout).toContain("command_failed: timeout waiting for page load");
  });

  it("redacts diagnostic stderr and recovery probe text without changing successful stdout", async () => {
    const controller = new AbortController();
    const { spawnCommand } = createSpawn((call) => {
      if (call.args[0] === "status") {
        queueMicrotask(() => {
          call.child.stdout.emit("data", "ok token=stdout-secret");
          call.child.stderr.emit("data", "Cookie: session=stderr-secret");
          call.child.emit("close", 0);
        });
      }
    });

    const status = await run("pire-browser", ["status"], controller.signal, {
      spawnCommand,
      toolTimeoutMs: 500,
    });

    expect(status.stdout).toBe("ok token=stdout-secret");
    expect(status.stderr).toContain("[REDACTED]");
    expect(status.stderr).not.toContain("stderr-secret");

    const recoveredController = new AbortController();
    const { spawnCommand: recoveredSpawn } = createSpawn((call) => {
      if (call.args[0] === "open") {
        queueMicrotask(() => {
          call.child.stderr.emit("data", "failed token=recovery-secret");
          call.child.emit("exit", 1);
        });
      }
      if (call.args[0] === "status") {
        queueMicrotask(() => {
          call.child.stdout.emit("data", "1 live pire-browser session(s):\nactive https://example.test/?code=probe-secret");
          call.child.emit("close", 0);
        });
      }
      if (call.args[0] === "tabs") {
        queueMicrotask(() => {
          call.child.stdout.emit("data", "t1 https://example.test/?access_token=tab-secret");
          call.child.emit("close", 0);
        });
      }
    });

    const recovered = await run("pire-browser", ["open", "https://example.test"], recoveredController.signal, {
      spawnCommand: recoveredSpawn,
      exitDrainMs: 1,
      probeTimeoutMs: 100,
      toolTimeoutMs: 500,
    });

    expect(recovered.stdout).toContain("[REDACTED]");
    expect(JSON.stringify(recovered)).not.toContain("recovery-secret");
    expect(JSON.stringify(recovered)).not.toContain("probe-secret");
    expect(JSON.stringify(recovered)).not.toContain("tab-secret");
  });

  it("does not recover a failed navigation exit without a live session", async () => {
    const controller = new AbortController();
    const { calls, spawnCommand } = createSpawn((call) => {
      if (call.args[0] === "open") {
        queueMicrotask(() => {
          call.child.stderr.emit("data", "command_failed: timeout waiting for page load");
          call.child.emit("exit", 1);
        });
      }
      if (call.args[0] === "status") {
        queueMicrotask(() => {
          call.child.stdout.emit("data", "0 live pire-browser session(s)");
          call.child.emit("close", 0);
        });
      }
    });

    const result = await run("pire-browser", ["open", "https://www.bing.com"], controller.signal, {
      spawnCommand,
      exitDrainMs: 1,
      probeTimeoutMs: 100,
      toolTimeoutMs: 500,
    });

    expect(calls.map((call) => call.args.join(" "))).toEqual(["open https://www.bing.com", "status"]);
    expect(result).toMatchObject({
      stderr: "command_failed: timeout waiting for page load",
      exitCode: 1,
      finishReason: "exit",
      timedOut: false,
      recovered: false,
    });
  });

  it("does not recover non-navigation commands from a live-session probe", async () => {
    const controller = new AbortController();
    const { calls, spawnCommand } = createSpawn();

    const result = await run("pire-browser", ["click", "@e1"], controller.signal, {
      spawnCommand,
      firstProbeDelayMs: 1,
      probeTimeoutMs: 10,
      toolTimeoutMs: 10,
    });

    expect(calls.map((call) => call.args.join(" "))).toEqual(["click @e1"]);
    expect(calls[0].child.killed).toBe(true);
    expect(result).toMatchObject({
      exitCode: 1,
      finishReason: "timeout",
      timedOut: true,
      recovered: false,
    });
  });

  it("returns spawn errors as tool failures", async () => {
    const controller = new AbortController();
    const { spawnCommand } = createSpawn((call) => {
      queueMicrotask(() => call.child.emit("error", new Error("spawn failed")));
    });

    const result = await run("missing", ["status"], controller.signal, {
      spawnCommand,
      toolTimeoutMs: 500,
    });

    expect(result).toMatchObject({
      exitCode: 1,
      finishReason: "error",
      timedOut: false,
      recovered: false,
    });
    expect(result.stderr).toContain("spawn failed");
  });

  it("kills the child and resolves when aborted", async () => {
    const controller = new AbortController();
    const { calls, spawnCommand } = createSpawn();
    const pending = run("pire-browser", ["status"], controller.signal, {
      spawnCommand,
      toolTimeoutMs: 500,
    });

    controller.abort();
    const result = await pending;

    expect(calls[0].child.killed).toBe(true);
    expect(result).toMatchObject({
      exitCode: null,
      finishReason: "abort",
      timedOut: false,
      recovered: false,
    });
  });
});
