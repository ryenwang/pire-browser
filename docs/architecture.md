# pire-browser Architecture

`pire-browser` is split across three trust/lifecycle boundaries:

1. `pire-browser.exe` is the CLI and Pi command backend.
2. `pire-browser-host.exe` is the Firefox Native Messaging host.
3. The Firefox extension is the browser-side controller.

Firefox owns the native host lifecycle once the extension is running. The extension starts `pire-browser-host.exe` through Native Messaging, and the CLI talks to that host through a current-user Windows named pipe.

For the default session only, browser-control commands may also use the managed Firefox launcher when no live extension session exists. In that cold-start path, the CLI starts Firefox through the managed `web-ext` profile, waits for the extension to connect back through Native Messaging, then dispatches the original command over the pipe. Explicit `--session` commands do not auto-launch; they require an existing live session until Epic 4 defines named-session lifecycle semantics.

## IPC

- Extension-to-host uses Firefox Native Messaging: 4-byte little-endian length prefix plus JSON body.
- CLI-to-host uses line-delimited JSON over a Windows named pipe.
- Pipe names include a hash of the current user SID and a per-host session ID.
- The pipe security descriptor grants full access to SYSTEM, built-in administrators, and the current user SID.

## Session Reconciliation

Firefox is the source of truth. The extension tracks tab/window/navigation events and emits heartbeats through Native Messaging. Session files expire when heartbeats stop.

If the user closes a tab, commands that target that tab return `tab_closed`. If Firefox exits or the extension disconnects, the session file is removed or becomes stale and the CLI reports `extension_disconnected`.

## Locator Model

Snapshot refs like `@e1` are not raw element handles. They store a re-resolvable locator recipe built from role, accessible-ish name, label, text, placeholder, test ID, and frame ID. Actions re-resolve the locator before touching the DOM.

When a locator cannot be re-resolved uniquely, commands return `ref_stale` or `ambiguous_locator` and the caller should run `snapshot -i` or a semantic `find` again.

## Known MVP Limits

- Actions are DOM-level, not trusted OS input.
- Cross-origin frames are best-effort. Inaccessible frames are opaque.
- Dialog handling uses a page-world shim and can only observe pages where injection is allowed.
- Screenshot support is visible-viewport only.
- Per-command flags that require a different browser process shape, such as headless mode or color scheme, are accepted for parser compatibility but reported as ignored warnings when JSON output is requested.
- Robust network-idle waits require network instrumentation and are deferred to the browser data plane.
- File upload automation is backend-specific; the Firefox WebExtension path does not claim local file input control.

## Epic 2 Readiness Notes

- Core waits in Epic 2 are DOM/content waits: selector state, text, URL, page load completion, fixed delay, and supported function predicates.
- `wait --load networkidle` belongs to Epic 5 because it depends on reliable network observation.
- Frame stitching is an Epic 2 reliability requirement. The extension must keep `all_frames: true`, stitch accessible frame snapshots into one result, and represent inaccessible frames as explicit opaque records.
- Lite observability moves into Epic 2: CLI/host/extension logs should carry command id, session id, command root, timing, timeout source, and error code. Screenshots, traces, HAR, dashboards, recording, and diffing remain Epic 6.
- IPC concurrency is an Epic 2 decision point. Until multiplexed dispatch is implemented and tested, reliability claims should assume single-flight command semantics.
