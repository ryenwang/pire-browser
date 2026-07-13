import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const introBlocks = [
  p("<strong>Firefox automation for AI agents, inspired and compatible with agent-browser.</strong> Reuse familiar commands, config files, environment aliases, skills, plugins, and session workflows while Firefox-specific backend differences stay explicitly documented."),
  p("Compact text output minimizes context usage. Native Rust CLI, local Firefox, and a version-matched agent guidance layer keep common workflows fast and predictable."),
  code(`npm install -g pire-browser        # all supported platforms
pire-browser install                   # connect Firefox (first time)
pi install npm:pire-browser            # Pi package

# or try without installing
npx -y pire-browser@latest open example.com`),
  h2("Features", "features"),
  list([
    "<strong>Agent-browser compatible:</strong> portable command shapes, configuration, <code>AGENT_BROWSER_*</code> aliases, skills, plugin protocol, state, and session recipes work across both tools.",
    "<strong>Agent-first:</strong> compact text output uses fewer tokens than a DOM dump and is designed for AI context efficiency.",
    "<strong>Ref-based:</strong> snapshots return accessibility trees with refs for deterministic element selection.",
    "<strong>Complete:</strong> 80+ command groups cover navigation, forms, screenshots, network, storage, files, tabs, frames, sessions, and debugging.",
    "<strong>Observable:</strong> <a href=\"./recording/\">recording</a>, <a href=\"./streaming/\">streaming</a>, <a href=\"./debugging/\">debugging</a>, <a href=\"./profiler/\">profiler</a>, and <a href=\"./diffing/\">diffing</a> tools are built in.",
    "<strong>Modern apps:</strong> <a href=\"./network/\">network control</a>, <a href=\"./react/\">React and Web Vitals</a>, <a href=\"./init-scripts/\">init scripts</a>, and <a href=\"./next/\">Next.js and Vercel</a> workflows have first-class docs.",
    "<strong>Stateful:</strong> <a href=\"./sessions/\">sessions</a>, managed Firefox profiles, encrypted auth, cookies, storage, proxy, and <a href=\"./security/\">security controls</a> support long-running agents.",
    "<strong>Agent integrations:</strong> <a href=\"./mcp/\">MCP</a>, Pi extension adapters, <a href=\"./skills/\">version-matched skills</a>, and <a href=\"./plugins/\">plugins</a> fit existing agent workflows.",
    "<strong>Cross-platform:</strong> native binaries for macOS, Linux, and Windows, selected automatically by the npm package.",
  ]),
  h2("Works with", "works-with"),
  p("Claude Code, Cursor, GitHub Copilot, OpenAI Codex, Google Gemini, opencode, and any agent that can run shell commands."),
  h2("Example", "example"),
  code(`# Navigate and get snapshot
pire-browser open https://example.com
pire-browser snapshot

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
  p("Native Rust binaries for macOS (ARM64, x64), Linux glibc (ARM64, x64), and Windows (ARM64, x64, x86). The root npm package selects the matching optional platform package automatically."),
];

export default page({
  path: "/",
  title: "pire-browser",
  navTitle: "Introduction",
  description: "Firefox automation for AI agents, inspired and compatible with agent-browser.",
  blocks: introBlocks,
});
