import { code, h2, p, page, statusNote, table } from "../blocks.mjs";

const mcpBlocks = [
  statusNote("mcp"),
  p("pire-browser exposes the main AI-agent browser workflow as a stdio Model Context Protocol server. This is useful when an agent host prefers typed tools over shell command strings."),
  h2("Start The Server", "start-the-server"),
  code(`pire-browser mcp
pire-browser mcp --tools core
pire-browser mcp --tools core,network
pire-browser mcp --tools core,state
pire-browser mcp --tools core,react
pire-browser mcp --tools all`),
  p("Use the smallest MCP profile that fits the task. <code>core</code> is the default inspect-before-act workflow. Add comma-separated profiles only when a workflow needs more surface, such as <code>core,network</code> for request/response waits and diagnostics, <code>core,state</code> for cookies, storage, auth, configured plugin discovery, and state files, or <code>core,react</code> for React Fiber inspection. The <code>pire_browser_tools_profiles</code> tool describes available profiles in-band."),
  h2("Profiles", "profiles"),
  table(
    ["Profile", "Purpose"],
    [
      ["core", "Open/goto/navigate, read, inspect, semantic find, interact, typed get/check verification, typed waits, back/forward/reload, SPA pushstate, init scripts, set-content fixtures, screenshot/PDF/diff evidence, eval/evaluate, confirmation follow-up, tab list/new/switch/close, profile discovery, status, close, and skill guidance."],
      ["network", "Headers, credentials, offline toggle, request/response waits, network request inspection with redacted headers, safe outgoing request-body previews, bounded text-like response previews, HAR export, and route/unroute controls."],
      ["state", "Cookies, storage, encrypted auth vault helpers, configured plugin discovery, plaintext or opt-in encrypted state files, sessions, profiles including Firefox profile import, downloads/uploads, typed clipboard tools, and skills."],
      ["debug", "Lower-level launch, explicit install/repair, user-requested package upgrade, batch diagnostics, doctor/activity diagnostics, console, page errors, JavaScript dialogs, highlight, Firefox trace bundles, screenshot-sequence recording bundles, dashboard-backed stream preview controls, best-effort vitals, diffs, status, sessions/profiles, and close."],
      ["tabs", "Broader tab/window workflows: compatible tabs_* aliases, tab labels, iframe selection, JavaScript dialogs, windows, and close."],
      ["mobile", "Viewport, device preset, geolocation, media/offline settings, keyboard, tap-as-click, swipe-as-scroll, mouse, scroll, and screenshot helpers."],
      ["react", "Best-effort Firefox React Fiber tree/inspect/render recording/Suspense tools plus vitals."],
      ["all", "Every currently implemented pire-browser MCP tool."],
    ]
  ),
  p("The server uses the same installed binary and command behavior as the CLI, so policies, setup, sessions, profiles, and Firefox runtime behavior stay shared."),
  p("The server defaults to MCP protocol <code>2025-11-25</code> and accepts older supported client protocol versions during initialization. Tool discovery is paginated for large profiles. Tool annotations distinguish read-only browser inspection from mutating actions and mark local maintenance/context tools such as install, upgrade, status, sessions, profiles, plugin discovery, and skills as non-open-world for clearer host approval prompts."),
  h2("Common Typed Fields", "common-typed-fields"),
  p("Most browser-command MCP tools accept common typed fields for CLI-global behavior that must be placed before the command. Prefer these fields over <code>extraArgs</code> when setting guardrails or launch context. Use <code>headless</code> for CI-style runs where a tool may launch a new managed Firefox session, <code>headed</code> to force the visible default, <code>args</code> for comma- or newline-separated Firefox launch arguments, or <code>userAgent</code> for a Firefox User-Agent override. Existing live sessions keep their current launch context. The lower-level debug-profile <code>pire_browser_launch</code> tool has a narrower launch-specific schema; prefer <code>pire_browser_open</code>, <code>pire_browser_goto</code>, or <code>pire_browser_navigate</code> for normal launch/navigation."),
  table(
    ["Field", "Purpose"],
    [
      ["session / sessionName / profile", "Target an existing live session, named managed profile, or managed profile path."],
      ["statePath", "Load a saved active-origin state file before the browser command. Encrypted files require the same state encryption key in the environment."],
      ["allowFileAccess", "Allow local file:// URL access for the command."],
      ["allowedDomains / noAllowedDomains", "Apply or explicitly bypass domain allowlist checks for the command."],
      ["actionPolicy / confirmActions / confirmInteractive", "Apply action-policy and confirmation guardrails before the command runs."],
      ["contentBoundaries / maxOutput", "Mark page-sourced output boundaries or cap emitted browser command text."],
      ["headless / headed", "Choose headless CI-style launch or visible launch when a tool starts a new managed Firefox session."],
      ["args / userAgent", "Pass Firefox launch arguments or a User-Agent override when a tool starts a new managed Firefox session."],
      ["proxy / proxyBypass / executablePath / downloadPath", "Configure Firefox proxy settings, the Firefox executable used for auto-launch, or the default Firefox download directory for newly launched managed sessions."],
    ]
  ),
  h2("Tool Surface", "tool-surface"),
  table(
    ["Tool", "Purpose"],
    [
      ["pire_browser_tools_profiles", "Describe MCP profiles and active selection."],
      ["pire_browser_launch", "Debug-profile lower-level managed Firefox launch with launch-specific profile, URL, Firefox path, headless/headed, args, userAgent, and policy fields. Prefer open for normal workflows."],
      ["pire_browser_install", "Debug-profile native-host setup or repair for the current OS user. Use withDeps only for agent-browser-style dependency recipes; it may install Firefox through winget/Chocolatey on Windows or Homebrew on macOS when missing, while Linux stays guided/manual."],
      ["pire_browser_upgrade", "Debug-profile foreground package upgrade through the installed npm/Pi launcher. Use only when the user asks to update the package."],
      ["pire_browser_batch", "Debug-profile typed batch for short command sequences. Commands may be strings or arrays of args; use bail when later commands depend on earlier success."],
      ["pire_browser_open / goto / navigate", "Launch Firefox and optionally navigate. Supports typed one-shot headers, initScriptPaths, and enableReactDevtools for pre-navigation setup."],
      ["pire_browser_read", "Read agent-friendly URL text without launching Firefox, or rendered text from the active tab."],
      ["pire_browser_snapshot", "Inspect the page and return refs. Use compact for noisy pages and cursorInteractive for visible cursor-pointer or inline onclick controls."],
      ["pire_browser_find", "Find by role, label, text, placeholder, alt text, title, test id, first, last, or nth; optionally act on the single match."],
      ["pire_browser_click / tap / dblclick / double_click / fill / type / press", "Perform page interactions. pire_browser_click accepts newTab for link targets that should open in a new tab. tap is a click-equivalent alias, not native touch input. Prefer the agent-browser-style dblclick spelling for new MCP clients; double_click remains compatible."],
      ["pire_browser_keyboard_type / keydown / keyup / key_down / key_up", "Type or dispatch key edges at the current focus. Prefer keydown/keyup for new MCP clients; key_down/key_up remain compatible."],
      ["pire_browser_hover / focus / select / check / uncheck", "Handle common form and interaction controls."],
      ["pire_browser_scroll / swipe / scroll_into_view / drag", "Move around the page and dispatch page-level drag/drop events. swipe maps touch direction to page scroll; it is not native touch input."],
      ["pire_browser_mouse_move / mouse_down / mouse_up / mouse_wheel", "Dispatch page-level mouse events at viewport coordinates."],
      ["pire_browser_get_text / get_html / get_value / get_attr / get_count / get_box / get_styles / get_url / get_title", "Agent-browser-style typed verification tools. Use these before the generic compatibility get tool."],
      ["pire_browser_get", "Compatibility getter for page or element text, HTML, values, attributes, title, URL, counts, boxes, or styles."],
      ["pire_browser_is_visible / is_enabled / is_checked", "Agent-browser-style typed element-state checks. Use these before the generic compatibility is tool."],
      ["pire_browser_is", "Compatibility state checker for visible, enabled, or checked."],
      ["pire_browser_wait_ms / wait_for_selector / wait_for_text / wait_for_url / wait_for_load / wait_for_function", "Agent-browser-style typed wait tools. Use these before the generic compatibility wait tool."],
      ["pire_browser_wait", "Compatibility wait tool for time, selector, text, URL, page function condition, or load state."],
      ["pire_browser_back / forward / reload / pushstate", "Use browser history, reload the active tab, or perform same-origin SPA client-side navigation."],
      ["pire_browser_eval / evaluate", "Evaluate JavaScript in the active page after the normal policy and confirmation checks. Prefer evaluate when following agent-browser-shaped recipes."],
      ["pire_browser_set_content", "Replace active page HTML for a small fixture or repro. It is gated as eval and should be followed by a fresh snapshot."],
      ["pire_browser_add_init_script / remove_init_script", "Register or remove document-start scripts for future navigations in the managed session."],
      ["pire_browser_screenshot / pdf", "Capture screenshot or image-backed PDF evidence. The screenshot tool hides native scrollbars by default and accepts hideScrollbars=false when scrollbar visibility is part of the evidence."],
      ["pire_browser_diff_snapshot / pire_browser_diff_screenshot / pire_browser_diff_url", "Compare snapshot text, screenshot pixels, or two URL states for QA evidence."],
      ["pire_browser_console / errors / dialog_* / highlight / trace_* / profiler_* / record_* / stream_* / vitals", "Inspect page logs, errors, JavaScript dialogs, visual targets, Firefox trace QA bundles, Performance Timeline profiler bundles, screenshot-sequence recording bundles, dashboard-backed WebSocket screenshot stream controls, and best-effort performance signals."],
      ["pire_browser_doctor / activity_list", "Run install diagnostics or inspect recent redacted command activity."],
      ["pire_browser_set_viewport / pire_browser_device / pire_browser_set_device / pire_browser_set_geo / pire_browser_set_headers / pire_browser_set_credentials / pire_browser_set_media / pire_browser_set_offline", "Apply Firefox-backed settings and best-effort emulation controls. Prefer pire_browser_device for agent-browser-style device presets; set_device remains compatible."],
      ["pire_browser_cookies_* / pire_browser_storage_*", "Read, set, clear, or import active URL cookies and active-origin Web Storage."],
      ["pire_browser_network_requests / request / wait_for_request / wait_for_response / har_* / route / unroute", "Inspect active-tab network metadata, wait for matching requests/responses, record/export HAR, and register best-effort routes. Network output may include redacted request/response headers, redacted/truncated outgoing request bodies, and bounded text-like response previews when Firefox exposes them."],
      ["pire_browser_plugin_list / pire_browser_plugin_show", "State-profile read-only discovery for configured agent-browser protocol plugins. Use these before choosing a credentialProvider for external-vault auth login."],
      ["pire_browser_auth_save / pire_browser_auth_login / pire_browser_auth_list / pire_browser_auth_show / pire_browser_auth_delete", "Save and reuse selector-driven encrypted auth-vault profiles without printing passwords in list/show output, or pass credentialProvider/item/url to resolve a one-shot login through a configured credential.read plugin. Use pire_browser_plugin_list/show to inspect configured plugins before choosing a provider."],
      ["pire_browser_state_*", "Save, load, list, show, inspect, rename, clear, or clean active-origin state files. Files are plaintext by default and AES-256-GCM encrypted when a state encryption key is set."],
      ["pire_browser_session_* / profiles_list / profiles_import", "Inspect live sessions and managed Firefox profiles, or copy an existing Firefox profile into managed pire-browser state."],
      ["pire_browser_download / wait_download / upload", "Trigger or wait for browser downloads, or assign bounded local files to file inputs."],
      ["pire_browser_clipboard_read / clipboard_write / clipboard_copy / clipboard_paste", "Agent-browser-style typed clipboard tools in the state profile."],
      ["pire_browser_clipboard", "Compatibility clipboard tool for read, write, copy, or paste."],
      ["pire_browser_status", "Inspect install/session state."],
      ["pire_browser_confirm / deny", "Approve or deny a pending confirmation id after explicit user approval."],
      ["pire_browser_tab_list / tab_new / tab_switch / tab_close / tabs_label", "Agent-browser-style tab tools for listing, creating, switching, and closing tabs; tabs_list/tabs_select/tabs_close remain compatible."],
      ["pire_browser_frame_switch / frame_select / frame_main", "Scope snapshots and selector-based actions to an iframe by ref, selector, name, or URL; iframe refs from snapshots can usually be acted on directly. Prefer frame_switch for new MCP clients; frame_select remains compatible."],
      ["pire_browser_window_new", "Open a separate Firefox window."],
      ["pire_browser_close", "Close managed sessions."],
      ["pire_browser_skills_get_core / skills_get_dogfood", "Return version-matched core guidance or exploratory QA/bug-hunt guidance."],
    ]
  ),
  h2("Agent Loop", "agent-loop"),
  code(`1. Call pire_browser_open, pire_browser_goto, or pire_browser_navigate with a URL. Use enableReactDevtools before React inspection. Add the debug profile and use pire_browser_launch only for lower-level launch diagnostics.
2. Use pire_browser_read for docs/articles when interaction refs are not needed.
3. Call pire_browser_snapshot with compact=true for noisy pages, cursorInteractive=true for custom clickable controls missing from the default snapshot, or use pire_browser_find when labels/roles are clear.
4. Use fresh refs or semantic find locators in click/double-click/fill/type/press/select/check/scroll/drag/mouse/download/upload tools.
5. Use typed get/check tools for targeted verification when you already have a fresh target: get_text, get_value, get_attr, get_url, get_title, is_visible, is_enabled, or is_checked. Use pire_browser_get and pire_browser_is only for compatibility.
6. Use iframe refs directly when a snapshot includes inner-frame controls. Use frame_switch only for scoped iframe snapshots or selector actions, and run frame_main before returning to outer-page selectors.
7. Use settings tools before screenshots or stateful QA when viewport, device preset, geolocation, headers, credentials, media, or offline mode matters.
8. Use pire_browser_set_content only for small fixture/repro pages. It replaces active document HTML, is gated as eval, and should be followed by a fresh snapshot.
9. Use diff tools when comparing before/after UI, screenshots, or two URLs for QA evidence.
10. Use console/errors/dialog/highlight/vitals/network tools when a page is stuck, blocked, or needs evidence.
11. Use auth tools only with user-approved credentials. For external vaults, add the state profile, call pire_browser_plugin_list or pire_browser_plugin_show before choosing a provider, prefer pire_browser_auth_login with credentialProvider/item/url fields over extraArgs, then verify login with a fresh snapshot, URL, or page state.
12. Use cookies/storage/state tools only when needed for user-approved state debugging or auth handoff; cookie import payloads and values may contain secrets.
13. Use debug-profile pire_browser_record_start/status/restart/stop for screenshot-sequence QA evidence, not native WebM video. Use debug-profile pire_browser_stream_enable/status/disable when the user wants dashboard-backed WebSocket screenshot streaming with basic remote input. It is not native WebM video or Chrome DevTools screencast output.
14. Use debug-profile pire_browser_install only when the user wants explicit native-host setup or repair; pass withDeps only for agent-browser-style dependency setup. On Windows/macOS it may install Firefox when missing; on Linux it reports non-Snap/non-Flatpak guidance. Use pire_browser_upgrade only when the user wants package update.
15. Keep pire_browser_status and plain pire_browser_doctor observational.
16. Use debug-profile pire_browser_batch only for short sequences where later steps do not depend on parsing intermediate output.
17. Call the typed wait tool that matches the condition: wait_ms, wait_for_selector, wait_for_text, wait_for_url, wait_for_load, or wait_for_function. Use pire_browser_wait only for compatibility.
18. Re-run pire_browser_snapshot or capture screenshot/PDF evidence before reporting success.`),
  p("MCP tool calls return text content for compatibility and structured command output when the underlying CLI emits JSON. If a tool is missing from the active profile, restart the MCP server with <code>--tools all</code> or a comma-separated profile list such as <code>--tools core,network</code>."),
];

export default page({
  path: "/mcp/",
  title: "MCP",
  description: "Typed stdio MCP tools for the core pire-browser workflow.",
  blocks: mcpBlocks,
});
