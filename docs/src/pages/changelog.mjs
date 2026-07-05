import { h2, list, p, page } from "../blocks.mjs";

const changelogBlocks = [
  h2("0.2.23", "0-2-23"),
  list([
    "Adds Firefox window lifecycle commands for popup-style workflows: <code>pire-browser window list</code>, <code>pire-browser window switch &lt;wN&gt;</code>, and <code>pire-browser window close [wN]</code>, plus matching MCP tools in the <code>tabs</code> profile.",
    "Clarifies the agent-browser-style tab workflow across help, README, docs, and the bundled core skill: bare <code>pire-browser tab</code> lists tracked tabs, <code>pire-browser tab &lt;id-or-label&gt;</code> switches directly, and <code>pire-browser tab close</code> closes the active tab.",
  ]),
  h2("0.2.20", "0-2-20"),
  list([
    "Preserves stdin for Windows npm-launched native commands that require it, including MCP stdio, <code>chat</code>, <code>eval --stdin</code>, <code>auth save --password-stdin</code>, <code>cookies set --curl -</code>, and stdin-driven <code>batch</code>.",
    "Makes source checkout dogfooding prefer freshly built Rust binaries before stale optional sidecars or transitional checked-in binaries.",
  ]),
  h2("0.2.19", "0-2-19"),
  list([
    "Improves MCP profile-mismatch errors so agents get the exact <code>--tools</code> profile combinations that expose a missing tool instead of a generic fallback hint.",
    "Aligns the in-band <code>pire_browser_tools_profiles</code> descriptions with the documented MCP profile surface for network waits, install/upgrade diagnostics, streams, tabs/windows, and state tools.",
  ]),
  h2("0.2.18", "0-2-18"),
  list([
    "Replaces remaining first-run status/auth/session guidance that pointed agents at lower-level <code>launch</code> with the public <code>open</code> workflow.",
    "Clarifies <code>launch --help</code> as a lower-level diagnostic path and keeps <code>open</code> as the normal launch/navigation command.",
  ]),
  h2("0.2.17", "0-2-17"),
  list([
    "Makes <code>doctor --json</code> and <code>install-status --json</code> recommend <code>pire-browser install</code> when Firefox Native Messaging registration is missing or mismatched, aligning machine-readable repair guidance with the documented first-run setup path.",
    "Clarifies installed-agent, README, and docs guidance so agents use <code>doctor --fix</code> only when they explicitly want the diagnose-then-repair wrapper.",
  ]),
  h2("0.2.16", "0-2-16"),
  list([
    "Makes <code>doctor --json</code> and <code>install-status --json</code> exit nonzero when setup health reports <code>data.ok: false</code>, so agents do not mistake a parseable diagnostic envelope for a healthy install.",
    "Clarifies installed-agent command guidance to inspect <code>data.ok</code> and <code>data.nextActions</code> during first-run repair.",
  ]),
  h2("0.2.15", "0-2-15"),
  list([
    "Improves first-run Firefox bridge diagnostics when <code>web-ext</code> exits before <code>pire-browser</code> connects or the extension session times out.",
    "Adds stable <code>Log:</code> and <code>nextActions</code> guidance to launch/connect failures so agents can run <code>doctor --json</code>, refresh setup, close managed Firefox/web-ext processes, and inspect the right log instead of guessing.",
  ]),
  h2("0.2.14", "0-2-14"),
  list([
    "Adds an isolated <code>smoke:pi-install</code> maintainer check that runs <code>pi install npm:pire-browser@&lt;version&gt;</code> against a temporary <code>PI_CODING_AGENT_DIR</code>, verifies package registration, and checks installed skill/version output without touching live Pi settings.",
    "Adds the Pi install smoke as a post-publish gate before GitHub release creation, and clarifies that npm <code>allow-scripts</code> warnings during Pi install are non-fatal unless the first browser command reports setup trouble.",
  ]),
  h2("0.2.13", "0-2-13"),
  list([
    "Shortens the first-use path across README, docs, launcher/native install help, setup success output, installed agent context, and the bundled core skill: install, run <code>pire-browser install</code>, then <code>open</code> and <code>snapshot -i</code>.",
    "Keeps repair and migration guidance available but frames <code>install --with-deps</code>, <code>doctor</code>, and Pi repair as fallback paths after setup or the first browser command reports a problem.",
  ]),
  h2("0.2.12", "0-2-12"),
  list([
    "Aligns native <code>pire-browser mcp --help</code> with the launcher-served MCP help so healthy installs and missing-native installs both show the same client config and profile-selection guidance.",
  ]),
  h2("0.2.11", "0-2-11"),
  list([
    "Adds copy-ready MCP client configuration examples to the README, docs site, launcher-served <code>mcp --help</code>, installed agent context, and bundled core skill.",
    "Clarifies profile selection for MCP-first agents: start with <code>core</code>, add the smallest needed profile, and reserve <code>all</code> for hosts that can tolerate the full tool surface.",
  ]),
  h2("0.2.10", "0-2-10"),
  list([
    "Makes the first-use MCP path explicit across the README, docs quick start, MCP page, installed agent context, and bundled core skill: start <code>pire-browser mcp --tools core</code>, then open, snapshot, act, wait, and verify with typed tools.",
  ]),
  h2("0.2.9", "0-2-9"),
  list([
    "Keeps <code>pire-browser mcp --help</code> useful from the JavaScript launcher when the optional native platform package is missing, so MCP-first agents can still discover <code>mcp --tools core</code> and profile guidance before repair.",
  ]),
  h2("0.2.8", "0-2-8"),
  list([
    "Marks Pi core runtime imports as optional peers so direct npm installs stay lean and avoid pulling Pi's dependency tree into normal CLI installs.",
    "Clarifies that skipped or blocked npm lifecycle scripts should be followed by an explicit <code>pire-browser install</code>.",
  ]),
  h2("0.2.7", "0-2-7"),
  list([
    "Keeps top-level help and setup/diagnostic command help available from the JavaScript launcher when the optional native platform package is missing.",
    "Points missing-native help output to version-matched skills and the concrete <code>--include=optional</code> reinstall command.",
  ]),
  h2("0.2.6", "0-2-6"),
  list([
    "Extends missing native package repair guidance to the first-run <code>install</code> and lower-level <code>setup</code> commands, including JSON output for agents.",
  ]),
  h2("0.2.5", "0-2-5"),
  list([
    "Keeps <code>doctor --json</code> and <code>install-status --json</code> useful when the optional native platform package is missing by serving a launcher-level diagnostic with concrete <code>--include=optional</code> reinstall guidance.",
    "Updates postinstall and installed-agent setup guidance to prefer the agent-browser-style <code>install</code> command over lower-level <code>setup</code> wording.",
  ]),
  h2("0.2.4", "0-2-4"),
  list([
    "Adds launcher-served <code>--version</code>, <code>-V</code>, and <code>version --json</code> output so agents can verify installed package resolution even when native setup needs repair.",
    "Aligns npm package, platform package, and Rust native version metadata for clearer public release diagnostics.",
    "Adds publish metadata checks so platform packages keep npm provenance-compatible repository metadata.",
  ]),
  h2("0.2.3", "0-2-3"),
  list([
    "Adds deterministic Pi duplicate-install recovery with <code>pire-browser pi conflicts</code> and <code>pire-browser pi repair</code>.",
    "Keeps old GitHub/local/ZIP-era install cleanup conservative, report-backed, and available through <code>npx -y pire-browser@latest pi repair</code> when Pi cannot start.",
  ]),
  h2("0.2.2", "0-2-2"),
  list([
    "Published public npm baseline for <code>pire-browser</code>.",
    "Ships local Firefox automation, Pi extension adapters, installed-agent guidance, public docs, and version-matched optional native packages.",
  ]),
  h2("Current package", "current-package"),
  p("The repository package version is currently <code>pire-browser@0.2.20</code>. Release details remain authoritative in the repository README, npm package metadata, and GitHub release artifacts."),
];

export default page({
  path: "/changelog/",
  title: "Changelog",
  description: "Public site and package changes.",
  blocks: changelogBlocks,
});
