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
      ["pire_browser_find", "Find by role, label, text, placeholder, alt text, title, test id, first, last, or nth; optionally act on the single match."],
      ["pire_browser_click / double_click / fill / type / press", "Perform page interactions."],
      ["pire_browser_keyboard_type / key_down / key_up", "Type or dispatch key edges at the current focus."],
      ["pire_browser_hover / focus / select / check / uncheck", "Handle common form and interaction controls."],
      ["pire_browser_scroll / scroll_into_view / drag", "Move around the page and dispatch page-level drag/drop events."],
      ["pire_browser_mouse_move / mouse_down / mouse_up / mouse_wheel", "Dispatch page-level mouse events at viewport coordinates."],
      ["pire_browser_get", "Read page or element text, HTML, values, attributes, title, URL, counts, boxes, or styles."],
      ["pire_browser_is", "Check whether a ref or selector is visible, enabled, or checked."],
      ["pire_browser_wait", "Wait for time, selector, text, URL, or load state."],
      ["pire_browser_screenshot / pdf", "Capture screenshot or image-backed PDF evidence."],
      ["pire_browser_console / errors / dialog_* / highlight / vitals", "Inspect page logs, errors, JavaScript dialogs, visual targets, and best-effort performance signals."],
      ["pire_browser_network_requests / request / har_* / route / unroute", "Inspect active-tab network metadata, record/export metadata HAR, and register best-effort routes."],
      ["pire_browser_state_*", "Save, load, list, show, inspect, rename, clear, or clean plaintext active-origin state files."],
      ["pire_browser_session_* / profiles_list", "Inspect live sessions and managed Firefox profiles."],
      ["pire_browser_download / wait_download / upload", "Trigger or wait for browser downloads, or assign small local files to file inputs."],
      ["pire_browser_clipboard", "Read, write, copy, or paste text through the Firefox extension path."],
      ["pire_browser_status", "Inspect install/session state."],
      ["pire_browser_tabs_list / tab_new / tabs_select / tabs_label / tabs_close", "Inspect, create, switch, label, and close tabs."],
      ["pire_browser_window_new", "Open a separate Firefox window."],
      ["pire_browser_close", "Close managed sessions."],
      ["pire_browser_skills_get_core", "Return version-matched agent guidance."],
    ]
  ),
  h2("Agent Loop", "agent-loop"),
  code(`1. Call pire_browser_open with a URL.
2. Call pire_browser_snapshot with compact=true, or use pire_browser_find when labels/roles are clear.
3. Use fresh refs or semantic find locators in click/double-click/fill/type/press/select/check/scroll/drag/mouse/download/upload tools.
4. Use pire_browser_get or pire_browser_is for targeted verification when you already have a fresh target.
5. Use console/errors/dialog/highlight/vitals/network tools when a page is stuck, blocked, or needs evidence.
6. Use state tools only for user-approved active-origin state files; state values are plaintext.
7. Call pire_browser_wait when page state needs time.
8. Re-run pire_browser_snapshot or capture screenshot/PDF evidence before reporting success.`),
  p("MCP tool calls return text content for compatibility and structured command output when the underlying CLI emits JSON."),
];

export default page({
  path: "/mcp/",
  title: "MCP",
  description: "Typed stdio MCP tools for the core pire-browser workflow.",
  blocks: mcpBlocks,
});
