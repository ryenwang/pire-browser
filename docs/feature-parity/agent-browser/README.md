# agent-browser Feature Parity Requirements

Generated from the left navigation and mirrored docs in `agent-browser-snapshot/website`.

Each page below has a status-marked requirements checklist for matching documented `agent-browser` commands or features in `pire-browser`. The current summary matrix is also available at [`../../agent-browser-compatibility.json`](../../agent-browser-compatibility.json), and the oracle workflow is documented in [`../../agent-browser-oracle-workflow.md`](../../agent-browser-oracle-workflow.md).

Latest update focus: the Firefox WebExtension backend now covers the core ref/selector command path, including CSS/text=/xpath= selectors, `get`, `is`, `type`, keyboard text insertion, explicit `select`/`check`/`uncheck`, left/right/container scroll, tab aliases, navigation commands, inline `batch`, cookies/storage, best-effort downloads, small-file in-page uploads, visible-viewport screenshot options, and structured JSON envelopes. Features that still rely on CDP, cloud providers, network routing, dashboards/streaming, video/trace/profiling, auth/state vaults, React/vitals, native file-picker control, or iOS remain unavailable or only best-effort.

When an older Claude/Gemini review note disagrees with the checkbox, treat the newest `GPT-5.5` note and the checkbox as authoritative for the current `pire-browser` worktree.

## Pages

- [Introduction](01-introduction.md) - 23 checklist item(s)
- [Installation](02-installation.md) - 30 checklist item(s)
- [Quick Start](03-quick-start.md) - 23 checklist item(s)
- [Skills](04-skills.md) - 12 checklist item(s)
- [Commands](05-commands.md) - 228 checklist item(s)
- [Configuration](06-configuration.md) - 15 checklist item(s)
- [Selectors](07-selectors.md) - 18 checklist item(s)
- [Snapshots](08-snapshots.md) - 27 checklist item(s)
- [Sessions](09-sessions.md) - 57 checklist item(s)
- [Dashboard](10-dashboard.md) - 17 checklist item(s)
- [Diffing](11-diffing.md) - 21 checklist item(s)
- [CDP Mode](12-cdp-mode.md) - 27 checklist item(s)
- [Streaming](13-streaming.md) - 29 checklist item(s)
- [Profiler](14-profiler.md) - 19 checklist item(s)
- [iOS Simulator](15-ios.md) - 43 checklist item(s)
- [Security](16-security.md) - 28 checklist item(s)
- [Next.js + Vercel](17-next.md) - 20 checklist item(s)
- [Native Mode](18-native-mode.md) - 2 checklist item(s)
- [AgentCore](19-providers-agentcore.md) - 12 checklist item(s)
- [Browser Use](20-providers-browser-use.md) - 4 checklist item(s)
- [Browserbase](21-providers-browserbase.md) - 4 checklist item(s)
- [Browserless](22-providers-browserless.md) - 6 checklist item(s)
- [Kernel](23-providers-kernel.md) - 6 checklist item(s)
- [Chrome](24-engines-chrome.md) - 12 checklist item(s)
- [Lightpanda](25-engines-lightpanda.md) - 17 checklist item(s)
- [Changelog](26-changelog.md) - 236 checklist item(s)
## Field Definitions

- Extension Compatibility means the behavior can be built on the current Firefox WebExtension + Native Messaging architecture, even if it is not implemented yet. False means it requires another backend such as CDP, Chrome, Lightpanda, Appium/iOS, or a cloud provider.
- Priority is the suggested build-plan importance for `pire-browser` feature parity.
- Complexity estimates implementation and validation effort in the current codebase.
- Testing describes the automated validation path to prove the item works or is intentionally unsupported.
- Oracle Coverage describes deterministic fixture coverage separately from implementation status. `covered` means `fixtures/oracle/cases.json` has a passing case, `uncovered` means the claim still needs a case, `not-comparable` means the behavior is outside the Firefox WebExtension oracle, and `smoke-only` means it is only exercised by a visible or external smoke.

## Review Rubric

- `[F]` means `pire-browser` already covers the user-visible behavior, allowing Firefox-equivalent wording where the `agent-browser` docs say Chrome.
- `[P]` means there is a real working slice in the current codebase, but the documented command shape, options, or reliability contract is incomplete.
- `[N]` is reserved for features that do not fit the Firefox WebExtension + Native Messaging architecture, such as CDP-only, cloud-provider, Lightpanda, or iOS/Appium backends.
- `[ ]` means compatible future work with no meaningful current implementation. Feasible someday is not enough to mark `[P]`.
