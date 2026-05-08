# Build Agent-Browser-Compatible `pire-browser`

## Summary
- Treat [`vercel-labs/agent-browser`](https://github.com/vercel-labs/agent-browser) README/docs as the compatibility spec: same command spelling, same selector grammar, same ref workflow, same `--json` style for every feature `pire-browser` claims to support.
- Implement the **full documented surface** in staged milestones, using Firefox/WebExtension best-effort behavior where Chrome/CDP behavior cannot be exact.
- Add a compatibility harness first so every documented command is tracked as `exact`, `best_effort`, or `not_available`, and no command silently drifts.

## Key Changes
- **Compatibility Contract**
  - Add a generated/curated compatibility matrix from the official `agent-browser` docs covering core commands, selectors, snapshots, wait, batch, tabs/windows/frames, dialogs, sessions/state, cookies/storage, network, streaming/dashboard, debug, security, auth, React/vitals, and init scripts.
  - Every command must parse with `pire-browser <same args>`; no unknown-command failures for documented `agent-browser` commands.
  - For Firefox gaps, return best-effort output with a `warning`/`limitations` field; return `not_available` only when no safe useful approximation exists.

- **CLI + Output Compatibility**
  - Normalize global flags: `--json`, `--timeout`, `--session`, `--session-name`, `--profile`, `--state`, `--headed`, `--headless`, `--color-scheme`, `--max-output`, `--content-boundaries`, `--allowed-domains`, `--confirm-actions`.
  - Match `agent-browser` JSON shape: success envelope, data payload, error object, warnings, and stable exit codes.
  - Keep current `pire-browser` internals, but add aliases such as `tab`/`tabs`, `press`/`key`, `close`/`quit`/`exit`, `goto`/`navigate`.

- **Selectors + Refs**
  - Replace locator-only refs with direct per-frame element handles in the content script; snapshot refs must be immediately actionable.
  - Accept all documented selector forms: `@eN`, CSS, `text=...`, `xpath=...`, role/name, label, placeholder, testid, alt, title, first/last/nth, and `--exact`.
  - Refs stay valid until the element is detached or the frame navigates; if a detached element can be uniquely recovered, do so and report `recovered: true`.

- **Full Surface Milestones**
  - Milestone 1: compatibility harness, parser aliases, JSON envelope, stable refs, selectors, `snapshot` options.
  - Milestone 2: core actions: `click`, `dblclick`, `fill`, `type`, keyboard commands, `hover`, `focus`, `select`, `check`, `uncheck`, `scroll`, `scrollintoview`, `drag`, best-effort `upload`.
  - Milestone 3: reading/state: `get`, `is`, `find`, `wait`, `batch`, navigation, tabs, windows, frames, dialogs.
  - Milestone 4: browser data: cookies, local/session storage, downloads, network request log, best-effort route/block/mock, HAR.
  - Milestone 5: sessions/profiles/state/auth/security plus `doctor`, dashboard, streaming, console/errors/highlight, diff, record, React/vitals, init scripts.
  - Milestone 6: Chrome/CDP-specific commands get Firefox approximations where possible; otherwise return `not_available` with a precise limitation, never a parser failure.

## Test Plan
- Add a docs-derived compatibility test suite where each documented `agent-browser` example maps to a fixture, command invocation, expected text/JSON shape, and compatibility status.
- Add fixtures for forms, unnamed textboxes, duplicate buttons, CSS/text/XPath selectors, iframes, dialogs, downloads, storage, network requests, React pages, and dynamic waits.
- Run unit tests for CLI parsing/result formatting, content-script selector resolution, ref lifecycle, and command handlers.
- Run end-to-end smoke tests on Windows: open Firefox, snapshot, act on refs, fill Lemonade-style composer, wait for enabled Send, click Send, and verify Pi gets a clean tool result.
- Acceptance gate: a command cannot be marked compatible unless the exact `agent-browser` spelling works under `pire-browser` and has a passing fixture test.

## Assumptions
- Source of truth is the official `vercel-labs/agent-browser` docs/README at implementation time, with the source commit recorded in the compatibility matrix.
- `pire-browser` remains Firefox/WebExtension-first; no Chrome/CDP backend is required for this plan.
- Best-effort behavior is acceptable for Firefox gaps, but success must mean a useful action or useful data actually happened.
- Existing `pire-browser` command behavior may be preserved through hidden legacy aliases/env flags, but the default user-facing behavior should prioritize `agent-browser` swap compatibility.
