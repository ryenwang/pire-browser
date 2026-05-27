# 04 - File Actions

Purpose: decide what repo artifacts should change after a session review.

## Inputs

- Roadmap table from `03-map-to-roadmap.md`.
- Current worktree status.
- Source inventory and roadmap docs.

## Process

1. Update roadmap docs only when a repeated or high-impact operational gap needs to become visible in build planning.
2. Create or update a plan/backlog note when the gap is concrete enough to preserve, but not ready for implementation.
3. Update `docs/source-inventory.md` when source sets, generated artifacts, workflows, or authoritative planning artifacts are added, removed, moved, or reclassified.
4. Do not edit generated compatibility JSON directly.
5. Do not mix session-review documentation with unrelated runtime or implementation changes.

## Output

Record proposed file actions:

| Action | File or artifact | Reason |
| --- | --- | --- |
| Add, update, or none | Path or artifact name | Why this is the right next step |

End with the verification commands to run, usually:

```powershell
git diff --check
rg -n "existing functionality|outside existing functionality|clipboard|operator help|auth/token" docs plans
npm run oracle:test
```
