import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runMock = vi.hoisted(() => vi.fn());

vi.mock("./pire-browser-runner", () => ({
  splitCommand: (command: string) => command.split(/\s+/).filter(Boolean),
  run: runMock,
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

import registerPireBrowser from "./pire-browser";

function registerTool() {
  const tools: any[] = [];
  registerPireBrowser({
    registerTool(tool: any) {
      tools.push(tool);
    },
  } as any);
  return tools[0];
}

describe("pire-browser Pi wrapper", () => {
  beforeEach(() => {
    runMock.mockReset();
    delete process.env.ORACLE_PI_MAX_TOOL_CALLS;
  });

  afterEach(() => {
    delete process.env.ORACLE_PI_MAX_TOOL_CALLS;
  });

  it("enforces the oracle Pi tool call cap", async () => {
    process.env.ORACLE_PI_MAX_TOOL_CALLS = "1";
    runMock.mockResolvedValue({
      stdout: "ok",
      stderr: "",
      exitCode: 0,
      finishReason: "close",
      timedOut: false,
      recovered: false,
    });

    const tool = registerTool();
    await tool.execute("call-1", { command: "status" }, new AbortController().signal);
    const second = await tool.execute("call-2", { command: "snapshot -i" }, new AbortController().signal);

    expect(runMock).toHaveBeenCalledTimes(1);
    expect(second.content[0].text).toContain("stopped after 1 tool call");
    expect(second.details).toMatchObject({
      exitCode: 1,
      finishReason: "tool-call-limit",
      timedOut: false,
      recovered: false,
    });
  });

  it("redacts command and diagnostic details while preserving successful stdout", async () => {
    runMock.mockResolvedValue({
      stdout: "page text token=visible-success",
      stderr: "Authorization: Bearer diagnostic-secret",
      exitCode: 0,
      finishReason: "close",
      timedOut: false,
      recovered: false,
      probe: {
        status: {
          stdout: "active https://example.test/?code=probe-secret",
          stderr: "",
          exitCode: 0,
          timedOut: false,
        },
        liveSession: true,
        liveTabs: false,
      },
    });

    const tool = registerTool();
    const result = await tool.execute(
      "call-1",
      { command: "open https://example.test/?access_token=command-secret" },
      new AbortController().signal
    );

    expect(result.content[0].text).toBe("page text token=visible-success");
    expect(JSON.stringify(result.details)).toContain("[REDACTED]");
    expect(JSON.stringify(result.details)).not.toContain("command-secret");
    expect(JSON.stringify(result.details)).not.toContain("diagnostic-secret");
    expect(JSON.stringify(result.details)).not.toContain("probe-secret");
  });
});
