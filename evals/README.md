# Agent Evals

This directory contains two public quality gates for agent-facing behavior:

- `context-footprint.mjs` measures the installed skill, routing context, MCP initialize response, compact core profile, and complete profile against fixed byte/token budgets.
- `run.mjs` optionally asks Codex or Claude to propose commands for representative pire-browser workflows, scores explicit expected and forbidden patterns, and writes a structured report.

The context gate is deterministic and runs during platform packaging and npm release validation. Live workflow evals are manual because model output can vary.

The harness injects skills/pire-browser/SKILL.md into every prompt. Agent responses must propose exact commands only. The harness never starts Firefox, invokes pire-browser, or contacts MCP; a live run only invokes the selected installed claude or codex CLI.

## Context Gate

Build a native CLI, then run:

    node evals/context-footprint.mjs --binary cli/target/debug/pire-browser --output target/evals/context-footprint.json

On Windows, use `cli/target/debug/pire-browser.exe`. The evaluator follows MCP pagination, verifies unique tools and required core commands, and checks that the MCP server version matches `package.json`.

## Live Workflow Run

From the repository root, with Node 22 and the selected authenticated CLI installed:

    node evals/run.mjs --provider codex --category workflow --json --output target/evals/agent-workflows.json

On macOS or Linux:

    node evals/run.mjs --provider claude --category qa

The harness uses the selected CLI's existing authentication. Provider errors identify missing credentials, missing CLIs, timeouts, and non-zero exits without echoing secret values. Codex runs ephemerally with a read-only sandbox; Claude runs in plan mode with strict MCP configuration. Both run from the operating-system temporary directory rather than the repository. The manual `Agent Workflow Evals` GitHub Actions workflow uses `OPENAI_API_KEY` for Codex or `ANTHROPIC_API_KEY` for Claude through repository secrets.

## Live Options

--provider claude|codex selects the installed agent CLI. --model, --category, --case, --timeout, --json, and --output control the run and report. --judge claude|codex enables an optional second-pass JSON judge; --judge-model and --judge-timeout configure it. The default judge is none, so regex scoring is deterministic and needs no additional model call.

Categories are skill, workflow, qa, and context. The case set covers skill loading before browser work, inspect-act-verify form handling with fresh snapshots, tabs and windows, logged-in profile discovery/import, the canonical QA evidence bundle, and bounded skill/MCP context discovery with pagination.

## Report

Reports use schema pire-browser/evals/v1. They contain run options, timestamps, summary counts, per-case status and score, matched or missing rubric checks, optional judge output, and redacted response text. They do not contain prompts, API keys, cookies, passwords, tokens, or raw provider stderr.

Run the focused tests with:

    npm run test:evals
