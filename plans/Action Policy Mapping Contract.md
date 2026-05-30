# Action Policy Mapping Contract

## Summary
This contract defines how future `pire-browser --action-policy` support should map commands to upstream `agent-browser` action categories. It is a planning and fixture slice only; it does not change runtime behavior.

The machine-readable source of truth is `fixtures/action-policy-command-map.json`. Implementation code and tests should consume or validate against that fixture so Rust and extension policy checks do not drift.

## Policy Shape
Future action policy support should load upstream-shaped JSON from `--action-policy <path>` or `AGENT_BROWSER_ACTION_POLICY`:

```json
{
  "default": "allow",
  "allow": ["navigate", "snapshot"],
  "deny": ["eval"],
  "confirm": ["download"]
}
```

Precedence is `deny`, then `confirm`, then `allow`, then `default`. `default: "deny"` blocks any executable non-meta command not explicitly allowed. Until confirmation queues exist, any matching `confirm` entry must fail closed with `ActionPolicyError: confirmation is not yet supported`; it must not silently allow the command.

## Categories
The 13 categories match the captured upstream security docs exactly:

`navigate`, `click`, `fill`, `eval`, `snapshot`, `scroll`, `wait`, `get`, `interact`, `state`, `network`, `download`, `upload`.

Implemented command mappings are recorded in the fixture. Important edge rules:

- Entry resolution is most-specific: compound command rules run first, exact meta bypasses run before policy categories, but a bare-root meta bypass must not shadow a more-specific command entry for the same root. Root+subcommand or explicit match entries beat root-only entries, and bare roots fall back to root-only entries when no specific entry matches.
- `batch` is not its own category. Check each subcommand independently and stop the batch on policy denial.
- Read-only `find` maps to `get`; chained `find ... click/fill/etc.` maps to the chained action category.
- `tab` and `tabs` are aliases and equivalent forms must resolve to the same category or meta bypass.
- The bare dialog command, `dialog status`, read-only `tabs list`, cookie reads, storage reads, and frame inspection-style commands map to `get`.
- Mutating tab/window commands that change or destroy the active browser surface map to `navigate`; `tab label` and `tabs label` are meta bypasses because they only update local tab metadata.
- `storage local set`, `storage session set`, `storage local clear`, and `storage session clear` map to `state`; storage reads map to `get`.
- `state save` and `state load` map to `state`.
- Clipboard and dialog mappings are `pire-browser` extensions beyond upstream's table: `clipboard read -> get`, `clipboard paste -> fill`, `clipboard write/copy -> state`, and `dialog accept/dismiss -> interact`. Clipboard write/copy are treated as `state` because they are side-effecting local state writes with no upstream category.

Unsupported or not-available commands should return their existing `unsupported_command` or `NotAvailableError` before policy checks. When future commands become executable, they join the upstream categories reserved in the fixture: `tap -> click`, `drag/mouse/dispatch -> interact`, eval-like script injection -> `eval`, `pdf/diff -> snapshot`, `network -> network`, `download -> download`, and `upload -> upload`.

## Enforcement Notes
CLI-side checks should cover commands that are local, launch before dispatch, or read files before contacting Firefox, such as `launch --url` and `state save/load`. Extension-side checks should cover page actions, active tab commands, and command forms only the extension can classify, such as chained `find`. Commands with both local and remote pieces, such as URL navigation and `tabs new`, should be tested on both sides.

Meta/local commands bypass action policy: `status`, `doctor`, `help`, `setup`, no-URL `launch`, `session` management, `close`, `quit`, `exit`, and `state inspect`.

## Implementation Follow-Up
The implementation slice should add parser capture for `--action-policy`, `AGENT_BROWSER_ACTION_POLICY`, diagnostics in `status`/`doctor`, `ActionPolicyError` envelopes, fixture-backed Rust and extension tests, and smoke coverage. It must include exhaustiveness tests proving every executable command root is policy-mapped, compound, meta-bypassed, reserved, unsupported, or not-available. Compatibility status should remain unchanged until oracle-backed coverage is added through the existing compatibility process.
