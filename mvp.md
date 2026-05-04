# Comprehensive MVP Plan: `pire-browser`

## Summary

Build **`pire-browser`**, a Windows-first Pi tool that accepts `agent-browser`-style commands and controls Firefox through a Firefox WebExtension + Native Messaging bridge.

Implemented MVP architecture:

- Rust CLI: `pire-browser.exe`.
- Rust Native Messaging host: `pire-browser-host.exe`.
- Firefox WebExtension: `pire-browser@pi.local`.
- Pi tool wrapper: `pire-browser`.
- Native host name: `dev.pi.pire_browser`.
- CLI-to-host IPC: current-user Windows named pipe.
- Extension-to-host IPC: Firefox Native Messaging.

## MVP Commands

```bash
pire-browser status
pire-browser setup --windows [--firefox-path <path>]
pire-browser open <url> [--new] [--label <label>]
pire-browser snapshot [-i|--interactive] [--json]
pire-browser find role <role> [--name <text>] [--index <n>]
pire-browser find label <text> [--index <n>]
pire-browser find text <text> [--index <n>]
pire-browser find placeholder <text> [--index <n>]
pire-browser find testid <value> [--index <n>]
pire-browser find <locator> click
pire-browser find <locator> fill <text>
pire-browser click <@eN>
pire-browser fill <@eN> <text>
pire-browser press <key>
pire-browser wait [--load] [--selector <css>] [--timeout <ms>]
pire-browser screenshot <path>
pire-browser tabs list
pire-browser tabs select <tN|label>
pire-browser tabs close <tN|label>
pire-browser tabs label <tN> <label>
pire-browser close
```

## Security And Lifecycle

Firefox owns the host lifecycle:

1. The extension calls `runtime.connectNative("dev.pi.pire_browser")`.
2. Firefox starts `pire-browser-host.exe`.
3. The host creates a named pipe and writes a session file under `%LOCALAPPDATA%\pire-browser\sessions`.
4. The CLI discovers a live session and sends JSON-RPC over the named pipe.
5. The host forwards commands to the extension over Native Messaging.

The named pipe includes a hash of the current Windows user SID and uses a security descriptor granting access to SYSTEM, built-in administrators, and the current user SID.

## Browser Behavior

- Tabs use stable `t1`, `t2`, etc. IDs with optional labels.
- Snapshot refs like `@e1` store locator recipes, not raw handles.
- Actions re-resolve refs before acting and return `ref_stale` or `ambiguous_locator` when needed.
- `find` supports role, label, text, placeholder, and test ID locators.
- Dialogs are captured with a page-world shim where injection is allowed.
- Screenshots are transferred in chunks below Firefox Native Messaging's 1 MB limit.

## Non-MVP

- BiDi/CDP.
- Trusted OS input.
- File upload automation.
- Cookies/storage/download/network APIs.
- Full-page screenshots and annotated screenshots.
- macOS/Linux installers.
