# Epic 2 Readiness Guardrails

## Summary
Tighten the roadmap and lightweight guardrails before Epic 2 starts. This pass updates the architecture contract to match existing auto-launch behavior, moves WebExtension-impossible work out of the default Firefox path, splits DOM waits from network-idle waits, makes IPC/frame risks explicit, and pulls minimal debug observability into Epic 2.

This is a **docs + guards** pass, not full Epic 2 implementation.

## Key Changes
- Update architecture and milestone docs so lifecycle is no longer contradictory:
  - Firefox still owns the Native Messaging host lifecycle once the extension is running.
  - The CLI may manage Firefox startup through the existing `launch_firefox` path for eligible default-session browser commands.
  - Auto-launch applies only when no explicit `--session` is requested and no live session exists.
  - Epic 2 success becomes: cold default-profile Firefox startup, extension connection, command dispatch, and repeated open/snapshot/action/wait loops without prompt hacks.

- Refine Epic placement:
  - Keep DOM/content waits in Epic 2: selector state, text, URL, load completion, fixed delay, and function waits where supported.
  - Move robust `networkidle` parity to Epic 5, backed by `webRequest`/network logging infrastructure.
  - Move file upload from Epic 5’s default Firefox data plane to Epic 8/backend-specific unless a future explicit OS-automation backend is approved.
  - Mark upload-related compatibility rows as Firefox/backend-specific gaps rather than best-effort Firefox core work.

- Add lightweight Epic 2 guard tests without changing browser behavior:
  - CLI lifecycle tests for auto-launch eligibility roots, explicit-session no-autolaunch behavior, and launch URL extraction for `open`/`goto`/`navigate`.
  - Contract/report test that upload rows are classified as backend-specific or not-comparable, not default Firefox core work.
  - Contract/report test that `networkidle` rows map to Epic 5 or are explicitly deferred, not counted as Epic 2 DOM-wait coverage.

- Make frame stitching an explicit Epic 2 technical hurdle:
  - Document that `all_frames: true` is already required and present.
  - Add Epic 2 acceptance fixtures for same-origin iframe refs/actions and cross-origin opaque-frame reporting.
  - Keep inaccessible frames represented as stable opaque frame records with clear metadata rather than silent omission.

- Pull “Lite Observability” into Epic 2:
  - Document a minimal debug mode for CLI/host/extension command tracing: command id, session id, method/root, start/end timestamps, error code, and timeout source.
  - Keep heavy screenshots, dashboard, traces, HAR, recordings, and diffing in Epic 6.
  - Add a guard that host debug logging remains available and includes request/response command ids.

- Capture IPC concurrency as an explicit Epic 2 decision:
  - Current behavior may serialize pipe requests behind long-running extension commands.
  - Epic 2 must either document single-flight semantics with stable timeout/status behavior, or implement host-side async/multiplexed dispatch before claiming concurrent reliability.
  - Add an Epic 2 test target for “long wait does not make status/debug unusable,” initially allowed to fail or remain pending until the chosen implementation lands.

## Test Plan
- Run docs/contract tests through `npm run oracle:test`.
- Add Rust unit tests around CLI auto-launch eligibility and launch URL extraction.
- Add oracle contract tests for upload and network-idle Epic ownership/disposition.
- Add a manifest/extension test confirming `all_frames: true` remains set.
- Add a host logging unit or integration test confirming request ids are present in debug log lines.
- Final acceptance for this pass: `npm run oracle:test`, `cargo test`, `npm test`.

## Assumptions
- This pass does not implement full Epic 2 reliability behavior.
- Existing auto-launch behavior is kept and documented rather than redesigned.
- File upload is not a Firefox WebExtension core feature for now.
- Network-idle parity requires Epic 5 network instrumentation.
- Cross-origin frame behavior remains best-effort/opaque unless content-script access is available.
