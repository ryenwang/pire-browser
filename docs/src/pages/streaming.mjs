import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const streamingBlocks = [
  unavailable("Runtime WebSocket viewport streaming"),
  h2("Current alternatives", "current-alternatives"),
  code(`pire-browser screenshot page.png
pire-browser record start
pire-browser record stop recording-dir
pire-browser dashboard start
pire-browser status --json
pire-browser session list --json`),
  p("Use the dashboard's read-only still preview, screenshots, screenshot-sequence recording bundles, and status output for observable CLI workflows while runtime viewport streaming is still being designed."),
];

export default page({
  path: "/streaming/",
  title: "Streaming",
  description: "Current capture options and future streaming direction.",
  badge: "Coming soon",
  blocks: streamingBlocks,
});
