# Operational Gap Backlog - 2026-05-26

This note records high-impact gaps observed during the May 26, 2026 `pire-browser` session review. It is a planning artifact, not a compatibility-status change.

## Session Summary

The reviewed session succeeded, but account setup and deployment work required several fallbacks outside existing `pire-browser` functionality. Later local and production page smoke testing was much smoother: open, snapshot, click, and screenshot flows worked well against both local preview and live site targets.

## Backlog Items

| Gap | Owner epic | Roadmap status | Why it matters | Next artifact |
| --- | --- | --- | --- | --- |
| Clipboard read/write/copy/paste on Firefox backend | Epic 5 | already represented | OAuth and platform setup pages often expose credentials through copy buttons. When browser clipboard operations are unavailable, agents fall back to fragile eval, source scraping, or manual copy paths. | Promote clipboard implementation priority within Epic 5 data-plane planning; keep fixture expectations tied to feature-parity clipboard rows. |
| Operator help/discovery and PATH/session attach ergonomics | Epic 2 / Epic 8 | implemented/in progress | Operators and agents need a reliable way to find the installed binary, discover command syntax, attach to the right live session, and recover from unsupported-command confusion. | Operator help/status/doctor landed; Session Lifecycle And Targeting adds `session list`, `session attach`, stale-session cleanup, and explicit-session recovery guidance. |
| Auth/token-flow ergonomics and secret-safe handoff | Epic 4 / Epic 7 | planned/in progress | Auth setup required one-time-token extraction and secret handling outside normal browser commands. The roadmap covers auth vault and credential safety, but the operator workflow needs an explicit safe handoff path. | Auth Handoff diagnostics added profile-based advisories; named profiles add reusable login contexts; the Profile State Save/Load slice adds plaintext active-origin cookie/Web Storage handoff; State Inspect And Save Guardrails adds metadata-only review and save-location warnings; State URL Hygiene And Inspect-Gated Load closes raw saved-URL success paths and adds opt-in receipt-gated loading; Strict State Load Policy adds cooperative env-backed defaults for receipt-gated loads while leaving auth vault and encrypted state out of scope. |

## Review Actions

- Use `docs/workflows/session-review-roadmap/` for future session reviews.
- Keep observed gaps separate from compatibility claims until fixture coverage or reviewed matrix updates justify a status change.
- Prefer new focused implementation plans over broad roadmap rewrites when a gap becomes ready to build.
