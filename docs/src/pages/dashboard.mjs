import { code, h2, p, page, statusNote } from "../blocks.mjs";

const dashboardBlocks = [
  statusNote("dashboard"),
  h2("Usage", "usage"),
  code(`pire-browser dashboard start
pire-browser dashboard start --background
pire-browser dashboard start --port 4848
pire-browser dashboard start --port 0 --json
pire-browser dashboard status --json
pire-browser dashboard stop`),
  p("The dashboard is a localhost server bound to <code>127.0.0.1</code>. Open the printed URL to inspect install health, live Firefox sessions, managed profiles, a live read-only viewport preview, optional AI Gateway chat, recent redacted command activity, and capability notes. Without <code>--background</code>, press <code>Ctrl+C</code> in the terminal to stop it. With <code>--background</code>, use <code>dashboard status</code> and <code>dashboard stop</code> to manage the recorded process."),
  h2("Current observability", "current-observability"),
  code(`pire-browser dashboard start
pire-browser dashboard start --background
pire-browser dashboard status
pire-browser status
pire-browser status --json
pire-browser session list --json
pire-browser profiles --json
pire-browser activity list --json
pire-browser record start
pire-browser record stop recording-dir
pire-browser doctor --json
pire-browser --auto-connect state save ./.pire-state/current.json`),
  p("Use the dashboard for a local summary, a live read-only preview that polls visible-viewport screenshots, and optional non-streaming dashboard chat powered by the same bounded AI Gateway command loop as <code>pire-browser chat</code>. The chat panel is enabled when <code>AI_GATEWAY_API_KEY</code> is present before the dashboard starts and forwards the currently previewed session when one exists. Use the CLI commands above when scripts or agents need structured output. Activity is a bounded command log with secret-bearing arguments redacted; verify page success with snapshots, screenshots, URL checks, or other page state."),
  h2("Limits", "limits"),
  p("The preview is live and read-only, but it is polling screenshot frames rather than a WebSocket viewport stream. Dashboard chat currently returns a final response after the bounded loop finishes instead of streaming model tokens or step updates. Dashboard-created sessions, remote input events, and native WebM/video recording remain future work in the Firefox backend. Use <code>record start</code> / <code>record stop</code> for screenshot-sequence recording."),
];

export default page({
  path: "/dashboard/",
  title: "Dashboard",
  description: "Local status, session, and profile observability dashboard.",
  badge: "Partial",
  blocks: dashboardBlocks,
});
