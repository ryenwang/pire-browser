import { code, h2, p, page, statusNote, table } from "../blocks.mjs";

const mcpBlocks = [
  statusNote("mcp"),
  p("pire-browser exposes the main AI-agent browser workflow as a stdio Model Context Protocol server. This is useful when an agent host prefers typed tools over shell command strings."),
  h2("Start The Server", "start-the-server"),
  code(`pire-browser mcp
pire-browser mcp --tools core
pire-browser mcp --tools core,network
pire-browser mcp --tools core,state
pire-browser mcp --tools all`),
  p("Use the smallest MCP profile that fits the task. <code>core</code> is the default inspect-before-act workflow. Add comma-separated profiles only when a workflow needs more surface, such as <code>core,network</code> for request diagnostics or <code>core,state</code> for cookies, storage, auth, and state files. The <code>pire_browser_tools_profiles</code> tool describes available profiles in-band."),
  h2("Profiles", "profiles"),
  table(
    ["Profile", "Purpose"],
    [
      ["core", "Open, read, inspect, semantic find, interact, get/check, wait, screenshot/PDF/diff evidence, eval, basic tabs, profile discovery, status, close, and skill guidance."],
      ["network", "Headers, credentials, offline toggle, network request inspection, metadata HAR, and route/unroute controls."],
      ["state", "Cookies, storage, auth helpers, plaintext state files, sessions, profiles, downloads/uploads, clipboard, and skills."],
      ["debug", "Console, page errors, JavaScript dialogs, highlight, best-effort vitals, diffs, status, sessions, and close."],
      ["tabs", "Tab list/new/select/label/close, iframe selection, JavaScript dialogs, windows, and close."],
      ["mobile", "Viewport, device preset, geolocation, media/offline settings, keyboard, mouse, scroll, and screenshot helpers."],
      ["react", "Compatibility profile only; React DevTools introspection is not shipped by the Firefox backend."],
      ["all", "Every currently implemented pire-browser MCP tool."],
    ]
  ),
  p("The server uses the same installed binary and command behavior as the CLI, so policies, setup, sessions, profiles, and Firefox runtime behavior stay shared."),
  h2("Tool Surface", "tool-surface"),
  table(
    ["Tool", "Purpose"],
    [
      ["pire_browser_tools_profiles", "Describe MCP profiles and active selection."],
      ["pire_browser_open", "Launch Firefox and optionally navigate."],
      ["pire_browser_read", "Read agent-friendly URL text without launching Firefox, or rendered text from the active tab."],
      ["pire_browser_snapshot", "Inspect the page and return refs."],
      ["pire_browser_find", "Find by role, label, text, placeholder, alt text, title, test id, first, last, or nth; optionally act on the single match."],
      ["pire_browser_click / double_click / fill / type / press", "Perform page interactions."],
      ["pire_browser_keyboard_type / key_down / key_up", "Type or dispatch key edges at the current focus."],
      ["pire_browser_hover / focus / select / check / uncheck", "Handle common form and interaction controls."],
      ["pire_browser_scroll / scroll_into_view / drag", "Move around the page and dispatch page-level drag/drop events."],
      ["pire_browser_mouse_move / mouse_down / mouse_up / mouse_wheel", "Dispatch page-level mouse events at viewport coordinates."],
      ["pire_browser_get", "Read page or element text, HTML, values, attributes, title, URL, counts, boxes, or styles."],
      ["pire_browser_is", "Check whether a ref or selector is visible, enabled, or checked."],
      ["pire_browser_wait", "Wait for time, selector, text, URL, page function condition, or load state."],
      ["pire_browser_screenshot / pdf", "Capture screenshot or image-backed PDF evidence."],
      ["pire_browser_diff_snapshot / pire_browser_diff_screenshot / pire_browser_diff_url", "Compare snapshot text, screenshot pixels, or two URL states for QA evidence."],
      ["pire_browser_console / errors / dialog_* / highlight / vitals", "Inspect page logs, errors, JavaScript dialogs, visual targets, and best-effort performance signals."],
      ["pire_browser_set_viewport / pire_browser_set_device / pire_browser_set_geo / pire_browser_set_headers / pire_browser_set_credentials / pire_browser_set_media / pire_browser_set_offline", "Apply Firefox-backed settings and best-effort emulation controls."],
      ["pire_browser_cookies_* / pire_browser_storage_*", "Read or mutate active URL cookies and active-origin Web Storage."],
      ["pire_browser_network_requests / request / har_* / route / unroute", "Inspect active-tab network metadata, record/export metadata HAR, and register best-effort routes."],
      ["pire_browser_auth_save / pire_browser_auth_login / pire_browser_auth_list / pire_browser_auth_show / pire_browser_auth_delete", "Save and reuse selector-driven auth profiles without printing passwords in list/show output."],
      ["pire_browser_state_*", "Save, load, list, show, inspect, rename, clear, or clean plaintext active-origin state files."],
      ["pire_browser_session_* / profiles_list", "Inspect live sessions and managed Firefox profiles."],
      ["pire_browser_download / wait_download / upload", "Trigger or wait for browser downloads, or assign small local files to file inputs."],
      ["pire_browser_clipboard", "Read, write, copy, or paste text through the Firefox extension path."],
      ["pire_browser_status", "Inspect install/session state."],
      ["pire_browser_tabs_list / tab_new / tabs_select / tabs_label / tabs_close", "Inspect, create, switch, label, and close tabs."],
      ["pire_browser_frame_select / pire_browser_frame_main", "Scope snapshots and selector-based actions to an iframe, or return to the main page frame."],
      ["pire_browser_window_new", "Open a separate Firefox window."],
      ["pire_browser_close", "Close managed sessions."],
      ["pire_browser_skills_get_core", "Return version-matched agent guidance."],
    ]
  ),
  h2("Agent Loop", "agent-loop"),
  code(`1. Call pire_browser_open with a URL.
2. Use pire_browser_read for docs/articles when interaction refs are not needed.
3. Call pire_browser_snapshot with compact=true, or use pire_browser_find when labels/roles are clear.
4. Use fresh refs or semantic find locators in click/double-click/fill/type/press/select/check/scroll/drag/mouse/download/upload tools.
5. Use pire_browser_get or pire_browser_is for targeted verification when you already have a fresh target.
6. Use frame_select when a snapshot shows an iframe you need to work inside; run frame_main before returning to outer-page controls.
7. Use settings tools before screenshots or stateful QA when viewport, device preset, geolocation, headers, credentials, media, or offline mode matters.
8. Use diff tools when comparing before/after UI, screenshots, or two URLs for QA evidence.
9. Use console/errors/dialog/highlight/vitals/network tools when a page is stuck, blocked, or needs evidence.
10. Use auth tools only with user-approved credentials, then verify login with a fresh snapshot, URL, or page state.
11. Use cookies/storage/state tools only when needed for user-approved state debugging; values may contain secrets.
12. Call pire_browser_wait when page state needs time.
13. Re-run pire_browser_snapshot or capture screenshot/PDF evidence before reporting success.`),
  p("MCP tool calls return text content for compatibility and structured command output when the underlying CLI emits JSON. If a tool is missing from the active profile, restart the MCP server with <code>--tools all</code> or a comma-separated profile list such as <code>--tools core,network</code>."),
];

export default page({
  path: "/mcp/",
  title: "MCP",
  description: "Typed stdio MCP tools for the core pire-browser workflow.",
  blocks: mcpBlocks,
});
