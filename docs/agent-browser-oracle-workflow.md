# Agent Browser Oracle Workflow

Milestone 0 treats the pinned `agent-browser` package as the reference oracle for future parity work. The goal is not to prove every `[F]` checklist item yet; it is to make covered, uncovered, and intentionally incomparable claims explicit and enforceable.

## Install The Pinned Oracle

The pinned baseline is recorded in `docs/agent-browser-oracle-baseline.json`.

```powershell
npm run oracle:install
npm run oracle:doctor
```

The install target is `target/agent-browser-oracle/npm`, and run artifacts are written under `target/agent-browser-oracle/runs`.

## Run The Validation Layers

Use the local fixture oracle as the deterministic gate:

```powershell
npm run oracle:ci
```

That command is equivalent to:

```powershell
npm run oracle:test
npm run oracle:wrapper
npm run oracle:doctor
npm run oracle:compare
npm run oracle:report
```

`oracle:report` defaults to the newest coverage-complete deterministic run and enforces coverage policy. A later visible subset run will not make the coverage gate fail accidentally. Use `npm run oracle:report -- --latest-any` to inspect the newest run of any kind, or `npm run oracle:report -- --run <run-dir>` to inspect a specific artifact directory. Subset inspection prints coverage policy as informational unless `--enforce-coverage` is supplied.

Use headed deterministic compare when you need to watch both browsers execute local fixture parity cases:

```powershell
npm run oracle:visible:compare
```

`npm run oracle:visible` is an alias for the same deterministic headed compare. This defaults to a small visible-safe fixture set. Pass `-Case "case-a,case-b"` to run a different comma-separated set of `visibleSafe` deterministic cases. External sites such as Bing are smoke-only and are not parity proof.

Use the separate Pi side-by-side demo only when you want model-backed visible terminals plus browser windows:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/oracle/visible-bing-side-by-side.ps1
```

`npm run oracle:pi` is optional and model-backed. It should skip or fail clearly when Pi model/API configuration is unavailable.

## Add A New Parity Case

Add deterministic fixture cases to `fixtures/oracle/cases.json`.

- Prefer local fixture assertions over `exitOnly`.
- Add `compatibilityItems` with the exact item id from `docs/agent-browser-compatibility.json`.
- Set `tapeCovered: true` only when the case proves the documented behavior for both tools.
- Use `status: "smoke"` and `visibleSafe: true` for browser-visible demos that should not block fixture acceptance.

Then run:

```powershell
npm run oracle:compare
npm run oracle:report
```

## Coverage States

Checklist status and oracle coverage are separate:

- `[F]`, `[P]`, `[N]`, and `[ ]` describe implementation status.
- `Oracle Coverage: covered` means a passing deterministic fixture case proves the behavior.
- `Oracle Coverage: uncovered` means the implementation claim exists but has not been migrated to deterministic fixture coverage.
- `Oracle Coverage: not-comparable` means the feature is intentionally outside the Firefox WebExtension backend or otherwise cannot be compared to `agent-browser`.
- `Oracle Coverage: smoke-only` means the behavior is exercised only by a visible or external smoke flow.

The machine-readable source of truth is `docs/agent-browser-compatibility.json`. `oracle:report` fails when docs mark an item covered without a passing case, or when a new/upgraded exact or best-effort claim lacks coverage.
For non-coverage-complete subset runs, use `--enforce-coverage` when you intentionally want the same strict policy exit behavior.

## Refresh The Baseline

Only refresh the pinned baseline deliberately:

```powershell
$env:AGENT_BROWSER_ORACLE_VERSION = "<new-version>"
npm run oracle:refresh-baseline
```

Review the generated run artifacts and update `docs/agent-browser-oracle-baseline.json` in the same change.

## Milestone 0 Definition Of Done

Milestone 0 is complete when:

- deterministic fixture comparison passes for the current Milestone 0 cases;
- `npm run oracle:ci` passes as the local Epic 0 gate;
- Pi wrapper and direct oracle wrapper tests pass;
- coverage policy reports covered, uncovered existing exact, and invalid new/upgraded claims;
- reports select the latest coverage-complete deterministic run by default;
- covered checklist entries include explicit Oracle Coverage annotations;
- headed Windows compare has been run once against visible-safe local fixture cases;
- uncovered exact claims are listed instead of silently implied by `[F]`.
