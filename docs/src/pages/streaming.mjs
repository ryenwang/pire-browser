import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const streamingBlocks = [
  statusNote("dashboard", "The dashboard provides a live read-only polling viewport preview. Runtime WebSocket viewport streaming is still unavailable."),
  h2("Current alternatives", "current-alternatives"),
  code(`pire-browser screenshot page.png
pire-browser record start
pire-browser record stop recording-dir
pire-browser dashboard start
pire-browser status --json
pire-browser session list --json`),
  p("Use the dashboard's live read-only preview for human-facing observability. It polls visible-viewport screenshots from the Firefox extension and does not provide WebSocket streaming, remote input events, or native WebM video. Use screenshots, screenshot-sequence recording bundles, and status output for scriptable evidence."),
];

export default page({
  path: "/streaming/",
  title: "Streaming",
  description: "Current live preview and capture options.",
  badge: "Partial",
  blocks: streamingBlocks,
});
