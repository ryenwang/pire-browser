# pire-browser Agent Context

Use this folder when you are operating an installed `pire-browser` package. It is a routing layer: read the smallest workflow contract that matches the task, then use the CLI output as the source of truth.

## Start Here

- Setup or broken install: `agent/workflows/setup-and-diagnose/CONTEXT.md`
- Before any click, type, or page action: `agent/workflows/inspect-before-act/CONTEXT.md`
- After an action: `agent/workflows/act-and-verify/CONTEXT.md`
- Sessions, state, files, and schema behavior: `agent/workflows/sessions-state-files/CONTEXT.md`
- Downloads, uploads, policies, and confirmations: `agent/workflows/transfers-and-policies/CONTEXT.md`
- Command and output contract: `agent/references/command-contract.md`
- Snapshot refs and stale refs: `agent/references/ref-lifecycle.md`
- Errors, confirmations, and recovery: `agent/references/safety-and-errors.md`

## Core Rules

- Use Firefox automation through `pire-browser`; do not substitute a different browser unless the user asks.
- Use `pire-browser read <url>` for docs/articles when interaction refs are not needed; use bare `pire-browser read` for rendered active-tab text. Use bare `pire-browser read --llms index|full`, `read --require-md`, `read --raw`, or `read --timeout <ms>` when the active tab URL should drive an HTTP docs fetch.
- Inspect with `pire-browser snapshot -i` before acting on a page.
- Treat snapshot refs as short lived. Use fresh refs after navigation, DOM changes, dialogs, downloads, uploads, or errors.
- Do not claim success until `pire-browser` output confirms it.
- If output returns `confirm <id>`, ask the user before running it.
- Prefer `pire-browser skills get core` when an agent skill needs complete operational guidance.
- If your host supports MCP tools, start with `pire-browser mcp --tools core` for the core inspect, semantic find, interact, typed get/check, typed wait, navigation helpers, init scripts, evidence, diff, eval, status, confirmation follow-up, basic tab, profile, close, and skill-guidance workflow. Prefer typed verification tools such as `pire_browser_get_text`, `pire_browser_get_value`, `pire_browser_get_attr`, `pire_browser_get_url`, `pire_browser_get_title`, `pire_browser_is_visible`, `pire_browser_is_enabled`, and `pire_browser_is_checked` over generic `pire_browser_get` or `pire_browser_is`. Prefer `pire_browser_wait_ms`, `pire_browser_wait_for_selector`, `pire_browser_wait_for_text`, `pire_browser_wait_for_url`, `pire_browser_wait_for_load`, or `pire_browser_wait_for_function` over the generic compatibility `pire_browser_wait`. Add comma-separated profiles only when needed, such as `core,network`, `core,state`, `core,debug`, `core,tabs`, or `core,mobile`; use `all` only when the host can tolerate the full tool surface. Use `core,state` for typed clipboard tools such as `pire_browser_clipboard_read` and `pire_browser_clipboard_write`. Prefer typed common fields over `extraArgs` for state files, file access, domain/action/confirmation policies, content boundaries, output limits, proxy settings, and Firefox executable overrides. Prefer `pire_browser_open` for normal launch/navigation; add `debug` and use `pire_browser_launch` only for lower-level launch diagnostics. Use debug-profile `pire_browser_install` only when the user wants explicit native-host setup or repair, and `pire_browser_upgrade` only when the user wants package update. Use debug-profile `pire_browser_batch` only for short sequences where later steps do not depend on parsing intermediate output. Use typed `pire_browser_confirm` or `pire_browser_deny` only after the user explicitly approves the pending confirmation id.
- The MCP server defaults to protocol `2025-11-25` and accepts older supported client protocol versions during initialization. Tool discovery is paginated for large profiles. Annotations mark local maintenance/context tools such as install, upgrade, status, sessions, profiles, and skills as non-open-world so hosts can present clearer approval prompts.
- For human-facing observability, `pire-browser dashboard start` opens a local status/session/profile/activity dashboard. For machine-readable automation, keep using `status --json`, `doctor --json`, `session list --json`, `activity list --json`, and MCP tools.

## Installed Package Boundaries

The installed package intentionally omits maintainer docs, fixtures, tests, and private development material. Do not infer package behavior from missing repository-only material. Use `agent/source-inventory.md` to identify what is authoritative in an installed copy.
