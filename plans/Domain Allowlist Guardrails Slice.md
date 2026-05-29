# Domain Allowlist Guardrails Slice

## Summary
Build the domain allowlist part of policy guardrails first. This adds opt-in `--allowed-domains` and `AGENT_BROWSER_ALLOWED_DOMAINS` checks for obvious wrong-site navigation and active-page actions. Action policy, confirmation queues, eval/download/upload policy, and policy JSON stay out of scope for the next slice.

## Key Changes
- Capture `--allowed-domains "example.com,*.example.com"` and `--no-allowed-domains` in the Rust CLI parser instead of silently discarding them.
- Support `AGENT_BROWSER_ALLOWED_DOMAINS` with the same comma-separated host pattern syntax.
- Enforce allowlists locally before URL-bearing launch/open/state-load work, and pass policy context to the extension for active-page commands.
- Expose `domainPolicy` in `status --json` and `doctor --json`, plus text summaries in non-JSON output.
- Document this as a cooperative guardrail, not a sandbox; redirects, subresources, WebSockets, EventSource, and TOCTOU-safe enforcement are out of scope.

## Test Plan
- Rust parser, matcher, diagnostic, and dispatch-adjacent tests.
- Extension regression tests for active-page policy checks.
- `npm run smoke:domain-policy` using `127.0.0.1` as the allowed host and `localhost` as the disallowed host.
- Full verification: `cargo test`, `cargo clippy --workspace --all-targets -- -D warnings`, `npm run test`, `npm --prefix extension run build`, `npm --prefix extension run test`, `npm run oracle:test`, `npm run smoke:domain-policy`, `npm run oracle:compare`, `cargo fmt --check`, and `git diff --check`.

## Assumptions
- Domain allowlists are opt-in and cooperative.
- Action policy is a separate follow-up after a command-to-action mapping table is designed.
- Multiple active allowlist sources are treated as logical AND in future extensions; this first slice uses explicit flag precedence over env, matching existing state-policy behavior.
