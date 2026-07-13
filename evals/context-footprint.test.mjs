import { describe, expect, it } from "vitest";
import {
  REQUIRED_CORE_TOOL_NAMES,
  collectMcpTools,
  evaluateContextFootprint,
  measureContext,
  parseArguments,
  validateContextFootprint,
  verifyUniqueToolNames,
} from "./context-footprint.mjs";

const tool = (name) => ({ name, description: `${name} description`, inputSchema: { type: "object" } });

function makeTools(count, prefix = "extra") {
  return Array.from({ length: count }, (_, index) => tool(`${prefix}_${index}`));
}

function pagedSession(tools, pageSize = 64, version = "test-version") {
  return {
    async request(request) {
      if (request.method === "initialize") {
        return {
          result: {
            protocolVersion: "2025-11-25",
            serverInfo: { name: "mock", version },
          },
        };
      }
      const cursor = request.params.cursor === undefined ? 0 : Number(request.params.cursor);
      const page = tools.slice(cursor, cursor + pageSize);
      const nextCursor = cursor + page.length < tools.length ? String(cursor + page.length) : undefined;
      return { result: { tools: page, ...(nextCursor ? { nextCursor } : {}) } };
    },
    async close() {},
  };
}

function smallMeasurements() {
  return {
    thinSkill: { bytes: 1, chars: 1, tokens: 1 },
    agentContext: { bytes: 1, chars: 1, tokens: 1 },
    cliRecommended: { bytes: 1, chars: 1, tokens: 1 },
    cliFull: { bytes: 1, chars: 1, tokens: 1 },
    initialize: { bytes: 1, chars: 1, tokens: 1 },
    mcpCore: { bytes: 10, chars: 10, tokens: 3 },
    mcpAll: { bytes: 100, chars: 100, tokens: 25 },
  };
}

describe("context footprint helpers", () => {
  it("measures UTF-8 bytes, JavaScript characters, and four-character tokens", () => {
    expect(measureContext("a\u00e9")).toEqual({ bytes: 3, chars: 2, tokens: 1 });
    expect(measureContext("12345")).toEqual({ bytes: 5, chars: 5, tokens: 2 });
  });

  it("follows tools/list cursors until the final page", async () => {
    const tools = makeTools(130);
    const collected = await collectMcpTools(pagedSession(tools, 64));
    expect(collected.pages).toEqual([
      { toolCount: 64, nextCursor: "64" },
      { toolCount: 64, nextCursor: "128" },
      { toolCount: 2, nextCursor: undefined },
    ]);
    expect(collected.tools).toHaveLength(130);
  });

  it("rejects duplicate MCP tool names", () => {
    expect(() => verifyUniqueToolNames([tool("same"), tool("same")])).toThrow(/Duplicate/);
  });

  it("requires the core workflow and paired confirmation tools", () => {
    const names = [...REQUIRED_CORE_TOOL_NAMES, "pire_browser_confirm"];
    expect(() => validateContextFootprint({
      coreTools: names.map(tool),
      allTools: [...names, ...makeTools(100)].map((item) => typeof item === "string" ? tool(item) : item),
      corePages: [{ toolCount: names.length }],
      allPages: [{ toolCount: 64, nextCursor: "64" }, { toolCount: 64 }],
      measurements: smallMeasurements(),
      versions: { package: "test-version", server: "test-version" },
    })).toThrow(/requiredCoreTools/);
  });

  it("rejects oversized context and release-version drift", () => {
    const coreTools = REQUIRED_CORE_TOOL_NAMES.map(tool);
    expect(() => validateContextFootprint({
      coreTools,
      allTools: [...coreTools, ...makeTools(100)],
      corePages: [{ toolCount: coreTools.length }],
      allPages: [{ toolCount: 64, nextCursor: "64" }, { toolCount: 64 }],
      measurements: {
        ...smallMeasurements(),
        cliRecommended: { bytes: 40 * 1024, chars: 40 * 1024, tokens: 10 * 1024 },
      },
      versions: { package: "0.2.35", server: "0.2.34" },
    })).toThrow(/recommendedSkillWithinBudget.*releaseVersionAligned/);
  });

  it("runs all probes with mocked command and MCP adapters", async () => {
    const coreTools = REQUIRED_CORE_TOOL_NAMES.map(tool);
    const allTools = [...coreTools, ...makeTools(100)];
    const calls = [];
    const result = await evaluateContextFootprint({
      binary: "mock-pire-browser",
      packageVersion: "test-version",
      thinSkillText: "thin skill",
      agentContextText: "agent context",
      run: async (_binary, args) => {
        calls.push(args);
        return { status: 0, stdout: args.join(" "), stderr: "" };
      },
      openMcp: async ({ profile }) => pagedSession(profile === "core" ? coreTools : allTools, 64),
    });
    expect(calls).toEqual([
      ["skills", "list"],
      ["skills", "get", "core"],
      ["skills", "get", "core", "--full"],
    ]);
    expect(result.validation.passed).toBe(true);
    expect(result.versions).toEqual({ package: "test-version", server: "test-version" });
    expect(result.mcp.core.pageCount).toBe(1);
    expect(result.mcp.all.pageCount).toBe(3);
    expect(result.measurements.thinSkill.bytes).toBe(10);
  });

  it("parses the CLI flags and supports equals forms", () => {
    expect(parseArguments(["--binary", "pire", "--output=out.json", "--json"])).toEqual({
      binary: "pire",
      output: "out.json",
      json: true,
    });
  });
});
