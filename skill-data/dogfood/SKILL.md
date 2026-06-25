---
name: dogfood
description: Systematic exploratory QA for web apps using pire-browser evidence.
---

# Dogfood QA Skill

Use this skill when the user asks you to dogfood, QA, test, bug hunt, review,
or explore a web app/site/platform. The goal is to behave like a careful user,
find real product issues, and leave evidence that another engineer can
reproduce.

Start by loading the core command guidance if you need syntax details:

```bash
pire-browser skills get core
```

## Operating Rules

1. Inspect before acting. Use `snapshot -i`, semantic `find`, and targeted
   `get`/`is` checks before reporting success or failure.
2. Keep one named session for the review so state, tabs, and evidence stay
   connected.
3. Prefer user-visible flows over implementation internals unless the user asks
   for a technical audit.
4. Verify every finding at least once before recording it as an issue.
5. Do not delete screenshots, recording bundles, logs, or reports during the
   session. Work forward.
6. Treat auth, payments, destructive actions, and external messages as
   user-approval boundaries.

## Setup

Create a predictable output directory:

```bash
mkdir -p dogfood-artifacts/screenshots dogfood-artifacts/recordings
pire-browser --session-name dogfood open https://app.example.com
pire-browser --session-name dogfood snapshot -i -c
```

If the app needs login state, ask the user whether to use an existing Firefox
profile, a managed profile, or a saved state file. Useful setup commands:

```bash
pire-browser profiles list
pire-browser profiles import <firefox-profile-dir> --name dogfood
pire-browser --profile dogfood open https://app.example.com
pire-browser --state ./.pire-state/app.json open https://app.example.com
```

## Exploration Loop

For each major user journey:

```bash
pire-browser --session-name dogfood snapshot -i -c
pire-browser --session-name dogfood find role button --name "Continue"
pire-browser --session-name dogfood click '<fresh-ref>'
pire-browser --session-name dogfood wait --load networkidle
pire-browser --session-name dogfood snapshot -i -c
pire-browser --session-name dogfood screenshot dogfood-artifacts/screenshots/NN-step.png
```

Use `type` instead of `fill` when you are collecting human-readable repro
evidence and timing matters. Use `fill` for fast setup outside the repro path.

## What To Test

- First impression: landing route, loading states, empty states, broken layout,
  inaccessible or hidden primary actions.
- Navigation: menus, tabs, breadcrumbs, back/forward, deep links, refresh, and
  route guards.
- Forms: validation, keyboard submission, required fields, error recovery,
  disabled/enabled states, file upload, and accidental double-submit.
- Auth and state: login persistence, logout, expired sessions, role-specific
  access, and cross-tab behavior.
- Data flows: create, edit, delete, search, filter, sort, pagination, download,
  upload, and undo/retry paths.
- Network and waiting: API request/response waits around submissions, optimistic
  UI states, retry behavior, and stale spinners.
- Accessibility and keyboard: labels, focus order, Enter/Escape behavior,
  visible focus, and whether snapshot roles/names are useful.
- Responsive behavior: viewport/device presets, scrollability, clipped text,
  sticky overlays, and mobile menus.

## Evidence

For static visual issues, one annotated screenshot plus URL/snapshot context is
usually enough:

```bash
pire-browser --session-name dogfood screenshot --annotate dogfood-artifacts/screenshots/issue-01.png
pire-browser --session-name dogfood get url
pire-browser --session-name dogfood snapshot -i -c
```

For interactive bugs, start a recording bundle before reproducing. In
`pire-browser`, recording is a bounded screenshot-sequence evidence directory,
not native WebM video:

```bash
pire-browser --session-name dogfood record start dogfood-artifacts/recordings/issue-01
pire-browser --session-name dogfood type '<input-ref>' "example"
pire-browser --session-name dogfood press Enter
pire-browser --session-name dogfood wait 1000
pire-browser --session-name dogfood screenshot dogfood-artifacts/screenshots/issue-01-final.png
pire-browser --session-name dogfood record stop dogfood-artifacts/recordings/issue-01
```

If the first reproduction attempt gets noisy, use:

```bash
pire-browser --session-name dogfood record restart dogfood-artifacts/recordings/issue-01-retake
```

## Debugging A Finding

Use these only when they help explain the user-visible bug:

```bash
pire-browser --session-name dogfood console --json
pire-browser --session-name dogfood errors --json
pire-browser --session-name dogfood network wait-for-request "**/api/**"
pire-browser --session-name dogfood network wait-for-response "**/api/**"
pire-browser --session-name dogfood vitals
pire-browser --session-name dogfood diff screenshot --baseline before.png after.png
```

Avoid over-collecting private data. Redact or omit secrets from reports.

## Report Format

For each issue, capture:

- Title
- Severity: blocker, high, medium, low
- Route/URL
- Environment: OS/browser if known, viewport, profile/session name
- Steps to reproduce
- Expected result
- Actual result
- Evidence paths: screenshot(s), recording bundle, relevant console/network
  notes
- Repro confidence: reproduced once, reproduced repeatedly, or intermittent

Close with a short summary of tested areas, issues found, and areas not covered.
