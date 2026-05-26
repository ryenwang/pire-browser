# Project Context Contract

This file defines the working contract for agent-led `pire-browser` development and session review. It is not a compatibility matrix and it does not change runtime behavior.

## Functional Boundaries

Use these labels when reviewing real browser-automation sessions:

- `existing functionality`: work completed through documented or currently supported `pire-browser` behavior, using the Firefox WebExtension backend as implemented today.
- `outside existing functionality`: work that required shell scripts, external CLIs or APIs, Codex in-app browser tooling, raw `eval` or source scraping, manual visual inspection, unsupported commands, or unimplemented backend behavior.
- `user/manual intervention`: steps where the user had to authenticate, approve, inspect, copy, paste, or otherwise complete an operation outside automation.
- `external-system issue`: failures caused primarily by a third-party service, deployment platform, page state, account permission, or network condition rather than `pire-browser`.

These labels describe observed operator workflow, not compatibility status. Compatibility claims still come from the pinned `agent-browser` docs, the compatibility matrix, and oracle coverage.

## Session Review Requirements

Every session review should include:

- Date and timezone.
- Evidence source, such as Codex session logs, `%LOCALAPPDATA%\pire-browser` runtime artifacts, screenshots, command output, or user notes.
- Short summary of how the session went.
- Things handled well by existing functionality.
- Things that went outside existing functionality.
- Roadmap mapping for each outside-functionality item.
- Proposed actions, including whether to update roadmap docs, create or update a plan/backlog note, update source inventory, add tests, or make no repo change.

Each gap should record:

| Field | Meaning |
| --- | --- |
| Evidence | Brief pointer to the log, command, screenshot, or observed flow. |
| Fallback used | The tool or manual step used when `pire-browser` was not enough. |
| Impact | Why the gap mattered to the session. |
| Owner epic | Epic 2 through Epic 8, or `new roadmap candidate` if no current epic fits. |
| Roadmap status | `already represented`, `partly represented`, or `not yet represented`. |
| Next artifact | The doc, plan, issue, fixture, or implementation slice that should carry the work forward. |

## Redaction Rules

- Never include raw access tokens, refresh tokens, session cookies, OAuth secrets, passwords, one-time login codes, or full authorization URLs with sensitive query parameters.
- Prefer describing sensitive values by role, such as `Convex one-time token` or `Google OAuth client secret`, rather than by value.
- If a command output contains secrets, summarize the outcome and record where the secret was stored only when that storage location is safe to mention.
- Screenshots used as evidence should avoid showing account identifiers, secret fields, or private user data unless the review explicitly needs that context and the artifact is handled as private.
- When unsure, redact first and preserve enough surrounding context to explain the workflow impact.

## Canonical Sources

- `docs/feature-parity/High Level Milestones.txt` defines epic ownership and build order.
- `docs/agent-browser-compatibility-schema.md` defines how compatibility rows are reviewed, covered, and ratcheted.
- `docs/workflows/session-review-roadmap/` defines the staged review workflow for real sessions.
- `plans/` records roadmap-visible implementation plans and session-derived backlog notes.
- `docs/source-inventory.md` records which source sets and process artifacts are authoritative.
