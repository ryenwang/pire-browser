import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const snapshotsBlocks = [
  h2("Overview", "overview"),
  p("Snapshots print a compact accessibility-oriented page tree with refs for interactive elements. Bare <code>snapshot</code> is the agent-browser-compatible default; <code>snapshot -i</code> remains available for the explicit legacy ref-list format."),
  h2("Options", "options"),
  code(`pire-browser snapshot
pire-browser snapshot -i
pire-browser snapshot --compact
pire-browser snapshot --cursor-interactive
pire-browser snapshot --urls
pire-browser snapshot --depth 5
pire-browser snapshot -s "#main"
pire-browser snapshot --selector "#main"
pire-browser snapshot --json`),
  p("Use <code>--cursor-interactive</code> or <code>-C</code> when a page uses clickable cards, menu rows, custom controls, or cursor-pointer elements that are missing from the default accessibility-oriented snapshot."),
  h2("Output format", "output-format"),
  code(`# @e1 [heading] "Example Domain"
# @e2 [link] "More information..."
# @e3 [textbox] "Email"`),
  h2("Using refs", "using-refs"),
  code(`pire-browser snapshot
pire-browser click '@e2'
pire-browser snapshot`),
  h2("Iframes", "iframes"),
  p("Iframe content is surfaced through the extension when it can be inspected from the current page context. Refs inside iframes carry frame context, so direct click/fill/get actions usually work without switching first. Use <code>frame &lt;ref|selector|name|url&gt;</code> only when you want scoped snapshots or selector-based actions inside one iframe."),
];

export default page({
  path: "/snapshots/",
  title: "Snapshots",
  description: "Compact page snapshots with refs.",
  blocks: snapshotsBlocks,
});
