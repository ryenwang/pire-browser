import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("@mariozechner/pi-tui", () => ({
  Text: class Text {
    constructor(
      public value: string,
      public x: number,
      public y: number
    ) {}
  },
}));

vi.mock("typebox", () => ({
  Type: {
    Object: (schema: unknown) => schema,
    String: (schema: unknown) => schema,
  },
}));

import registerAgentBrowserOracle from "./agent-browser-oracle";

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

function registerTool() {
  const tools: any[] = [];
  registerAgentBrowserOracle({
    registerTool(tool: any) {
      tools.push(tool);
    },
  } as any);
  return tools[0];
}

describe("agent-browser-oracle Pi wrapper", () => {
  beforeEach(() => {
    spawnMock.mockReset();
    delete process.env.AGENT_BROWSER_ORACLE_OUTPUT_IDLE_MS;
    delete process.env.ORACLE_PI_MAX_TOOL_CALLS;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("routes command args and returns stdout/details", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const tool = registerTool();
    const pending = tool.execute("call-1", { command: 'fill "#email" "a b@example.com"' }, new AbortController().signal);

    child.stdout.emit("data", "filled");
    child.emit("close", 0);
    const result = await pending;

    expect(spawnMock.mock.calls[0][1]).toEqual(["fill", "#email", "a b@example.com"]);
    expect(result.content[0].text).toBe("filled");
    expect(result.details).toMatchObject({
      command: 'fill "#email" "a b@example.com"',
      exitCode: 0,
      finishReason: "close",
      timedOut: false,
    });
    expect(child.stdout.destroyed).toBe(true);
    expect(child.stderr.destroyed).toBe(true);
  });

  it("propagates stderr and nonzero exits", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const tool = registerTool();
    const pending = tool.execute("call-1", { command: "click @e404" }, new AbortController().signal);

    child.stderr.emit("data", "ref_stale");
    child.emit("close", 1);
    const result = await pending;

    expect(result.content[0].text).toBe("ref_stale");
    expect(result.details).toMatchObject({
      exitCode: 1,
      stderr: "ref_stale",
    });
  });

  it("can finish on output idle for long-lived agent-browser processes", async () => {
    vi.useFakeTimers();
    process.env.AGENT_BROWSER_ORACLE_OUTPUT_IDLE_MS = "10";
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const tool = registerTool();
    const pending = tool.execute("call-1", { command: "open https://example.com" }, new AbortController().signal);

    child.stdout.emit("data", "opened");
    await vi.advanceTimersByTimeAsync(11);
    const result = await pending;

    expect(result.details).toMatchObject({
      exitCode: 0,
      finishReason: "output-idle",
      timedOut: false,
    });
    expect(child.stdout.destroyed).toBe(true);
  });

  it("kills the child and resolves on abort", async () => {
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const tool = registerTool();
    const controller = new AbortController();
    const pending = tool.execute("call-1", { command: "snapshot -i" }, controller.signal);

    controller.abort();
    const result = await pending;

    expect(child.killed).toBe(true);
    expect(result.details).toMatchObject({
      exitCode: null,
      finishReason: "abort",
      timedOut: false,
    });
  });

  it("enforces the oracle Pi tool call cap", async () => {
    process.env.ORACLE_PI_MAX_TOOL_CALLS = "1";
    const child = new FakeChild();
    spawnMock.mockReturnValue(child);
    const tool = registerTool();

    const first = tool.execute("call-1", { command: "status" }, new AbortController().signal);
    child.stdout.emit("data", "ok");
    child.emit("close", 0);
    await first;

    const second = await tool.execute("call-2", { command: "snapshot -i" }, new AbortController().signal);
    expect(spawnMock).toHaveBeenCalledTimes(1);
    expect(second.content[0].text).toContain("stopped after 1 tool call");
    expect(second.details).toMatchObject({
      exitCode: 1,
      finishReason: "tool-call-limit",
      timedOut: false,
    });
  });
});
