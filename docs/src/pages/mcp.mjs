import { code, h2, p, page, statusNote, table } from "../blocks.mjs";

const mcpBlocks = [
  statusNote("mcp"),
  p("pire-browser exposes the main AI-agent browser workflow as a stdio Model Context Protocol server. This is useful when an agent host prefers typed tools over shell command strings."),
  h2("Start The Server", "start-the-server"),
  code(`pire-browser mcp
pire-browser mcp --tools core
pire-browser mcp --tools all`),
  p("The current public MCP profile is <code>core</code>. <code>--tools all</code> is accepted as an alias for all currently available MCP tools. The server uses the same installed binary and command behavior as the CLI, so policies, setup, sessions, profiles, and Firefox runtime behavior stay shared."),
  h2("Core Tools", "core-tools"),
  table(
    ["Tool", "Purpose"],
    [
      ["pire_browser_open", "Launch Firefox and optionally navigate."],
      ["pire_browser_snapshot", "Inspect the page and return refs."],
      ["pire_browser_click / fill / type / press", "Perform page interactions."],
      ["pire_browser_get", "Read page or element text, HTML, values, attributes, title, URL, counts, boxes, or styles."],
      ["pire_browser_is", "Check whether a ref or selector is visible, enabled, or checked."],
      ["pire_browser_wait", "Wait for time, selector, text, URL, or load state."],
      ["pire_browser_screenshot", "Capture screenshot evidence."],
      ["pire_browser_status", "Inspect install/session state."],
      ["pire_browser_tabs_list / tab_new", "Inspect and create tabs."],
      ["pire_browser_close", "Close managed sessions."],
      ["pire_browser_skills_get_core", "Return version-matched agent guidance."],
    ]
  ),
  h2("Agent Loop", "agent-loop"),
  code(`1. Call pire_browser_open with a URL.
2. Call pire_browser_snapshot with compact=true.
3. Use fresh refs in click/fill/type/press tools.
4. Use pire_browser_get or pire_browser_is for targeted verification when you already have a fresh target.
5. Call pire_browser_wait when page state needs time.
6. Re-run pire_browser_snapshot or capture a screenshot before reporting success.`),
  p("MCP tool calls return text content for compatibility and structured command output when the underlying CLI emits JSON."),
];

export default page({
  path: "/mcp/",
  title: "MCP",
  description: "Typed stdio MCP tools for the core pire-browser workflow.",
  blocks: mcpBlocks,
});
