import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const introBlocks = [
  p("Firefox automation CLI designed for AI agents. Compact text output minimizes context usage. Native Rust binaries keep common browser workflows fast, while Firefox does the real page work."),
  code(`npm install -g pire-browser
pire-browser install                 # first-time Firefox setup

pire-browser open https://example.com
pire-browser snapshot -i`),
  p("For Pi, install the package with <code>pi install npm:pire-browser</code>, then ask the agent to use <code>pire-browser</code>. For one-off shell trials, use <code>npx -y pire-browser@latest open https://example.com</code> followed by <code>npx -y pire-browser@latest snapshot -i</code>."),
  h2("Features", "features"),
  list([
    "<strong>Agent-first:</strong> compact text output uses fewer tokens than a DOM dump and is easy for agents to parse.",
    "<strong>Ref-based:</strong> snapshots return accessibility trees with refs for deterministic element selection.",
    "<strong>Firefox native:</strong> commands run through a WebExtension and Native Messaging bridge.",
    "<strong>Stateful:</strong> sessions, managed Firefox profiles, active-origin state files, cookies, storage, downloads, uploads, and guardrails support long-running agents.",
    "<strong>Observable:</strong> screenshots, annotated captures, console/errors, network request summaries, status, and doctor output are built in.",
    "<strong>Agent integrations:</strong> ships Pi extension adapters, a stdio MCP server, and version-matched skill guidance.",
  ]),
  h2("Works with", "works-with"),
  p("Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Google Gemini, opencode, and any agent that can run shell commands."),
  h2("Example", "example"),
  code(`# Navigate and get snapshot
pire-browser open https://example.com
pire-browser snapshot -i

# Output:
# @e1 [heading] "Example Domain"
# @e2 [link] "More information..."

# Interact using refs
pire-browser click '@e2'
pire-browser screenshot page.png
pire-browser close`),
  h2("Why refs?", "why-refs"),
  p("The <code>snapshot</code> command returns a compact accessibility tree where each element has a unique ref like <code>@e1</code> or <code>@e2</code>. This gives agents a small, deterministic target list."),
  list([
    "<strong>Context-efficient:</strong> text output is much smaller than full DOM HTML.",
    "<strong>Deterministic:</strong> a ref points to the exact element from the latest snapshot.",
    "<strong>Fast:</strong> agents can act without inventing selectors.",
    "<strong>AI-friendly:</strong> LLMs parse the text format naturally.",
  ]),
  h2("Architecture", "architecture"),
  p("Client-host architecture for Firefox automation:"),
  ol([
    "<strong>Rust CLI:</strong> parses commands, formats results, and manages setup.",
    "<strong>Native Messaging host:</strong> connects the CLI to Firefox through current-user IPC.",
    "<strong>Firefox WebExtension:</strong> inspects the page, performs DOM actions, captures screenshots, and reports session state.",
  ]),
  h2("Platforms", "platforms"),
  p("Native Rust binaries for macOS, Linux, and Windows. The root npm package selects the matching optional platform package for your OS and architecture."),
];

export default page({
  path: "/",
  title: "pire-browser",
  navTitle: "Introduction",
  description: "Firefox-backed browser automation for AI agents.",
  blocks: introBlocks,
});
