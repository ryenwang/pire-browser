import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const streamingBlocks = [
  statusNote("dashboard", "Dashboard-backed stream preview controls are available. Full WebSocket viewport streaming is still unavailable."),
  h2("Dashboard-backed preview stream", "dashboard-backed-preview-stream"),
  code(`pire-browser stream enable
pire-browser stream status --json
pire-browser stream disable`),
  p("<code>stream enable</code> starts the local dashboard in the background and exposes the same live read-only viewport preview used by <code>dashboard start</code>. The transport is dashboard HTTP polling of visible-viewport screenshots, not full agent-browser WebSocket frame streaming."),
  table(["Field", "Meaning"], [
    ["transport", "<code>dashboard-http-polling</code> when enabled"],
    ["webSocketStreaming", "<code>false</code> on the current Firefox backend"],
    ["liveViewportKind", "<code>polling-screenshot-preview</code>"],
    ["dashboardUrl", "The local dashboard URL when the preview service is running"],
  ]),
  h2("Evidence alternatives", "evidence-alternatives"),
  code(`pire-browser screenshot page.png
pire-browser record start
pire-browser record stop recording-dir
pire-browser dashboard start --background
pire-browser status --json
pire-browser session list --json`),
  p("Use screenshots, screenshot-sequence recording bundles, and status output for scriptable evidence. The dashboard-backed preview does not provide remote input events or native WebM video."),
];

export default page({
  path: "/streaming/",
  title: "Streaming",
  description: "Current live preview and capture options.",
  badge: "Partial",
  blocks: streamingBlocks,
});
