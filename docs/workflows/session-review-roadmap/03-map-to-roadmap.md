# 03 - Map To Roadmap

Purpose: connect observed gaps to the roadmap without turning one session into an unsupported compatibility claim.

## Inputs

- Classified gaps from `02-classify-functionality.md`.
- `docs/feature-parity/High Level Milestones.txt`.
- `docs/agent-browser-compatibility-schema.md`.
- Existing plans and backlog notes under `plans/`.

## Process

1. Map each outside-functionality gap to the most specific owner epic:
   - Epic 2 for core loop reliability, command ergonomics, launch, status, waits, refs, and lite logs.
   - Epic 3 for selector language, ref recovery, ambiguity, and target-resolution parity.
   - Epic 4 for sessions, profiles, state, auth reuse, and auth vault integration.
   - Epic 5 for clipboard, downloads, storage APIs, headers, network logging, and network-idle behavior.
   - Epic 6 for screenshots, annotations, dashboard, traces, logs, recordings, and failure bundles.
   - Epic 7 for credential handling, redaction, policies, confirmations, audit logs, and safe unattended operation.
   - Epic 8 for backend-specific capabilities, OS automation, cloud providers, Next.js/Vercel helpers, skills, and capability discovery.
2. Mark roadmap status as:
   - `already represented` when the gap is clearly covered by an existing epic and feature-parity row.
   - `partly represented` when the epic exists but the concrete operator problem is not explicit.
   - `not yet represented` when no roadmap text captures the gap.
3. Identify the next artifact that should carry the work: roadmap doc, plan/backlog note, compatibility row, oracle fixture, or implementation slice.

## Output

Produce a roadmap table:

| Gap | Owner epic | Roadmap status | Next artifact |
| --- | --- | --- | --- |
| Short name | Epic N | already represented, partly represented, or not yet represented | File or action |

Use this table to decide file updates in the next stage.
