# pire-browser Architecture

`pire-browser` is split across three trust/lifecycle boundaries:

1. `pire-browser.exe` is the CLI and Pi command backend.
2. `pire-browser-host.exe` is the Firefox Native Messaging host.
3. The Firefox extension is the browser-side controller.

Firefox owns the native host lifecycle. The CLI never starts or stops Firefox and never talks to Firefox directly. It discovers a live extension session from `%LOCALAPPDATA%\pire-browser\sessions`, connects to the session's Windows named pipe, sends one JSON-RPC command, and prints the response.

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
