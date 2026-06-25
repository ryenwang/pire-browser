import { code, h2, p, page, statusNote } from "../blocks.mjs";

const dashboardBlocks = [
  statusNote("dashboard"),
  h2("Usage", "usage"),
  code(`pire-browser dashboard start
pire-browser dashboard start --port 4848
pire-browser dashboard start --port 0 --json`),
  p("The dashboard is a foreground localhost server bound to <code>127.0.0.1</code>. Open the printed URL to inspect install health, live Firefox sessions, managed profiles, a read-only still viewport preview, recent redacted command activity, and capability notes. Press <code>Ctrl+C</code> in the terminal to stop it."),
  h2("Current observability", "current-observability"),
  code(`pire-browser dashboard start
pire-browser status
pire-browser status --json
pire-browser session list --json
pire-browser profiles --json
pire-browser activity list --json
pire-browser record start
pire-browser record stop recording-dir
pire-browser doctor --json
pire-browser --auto-connect state save ./.pire-state/current.json`),
  p("Use the dashboard for a local summary and a refreshable still preview, and use the CLI commands above when scripts or agents need structured output. Activity is a bounded command log with secret-bearing arguments redacted; verify page success with snapshots, screenshots, URL checks, or other page state."),
  h2("Limits", "limits"),
  p("This is not the full agent-browser live viewport dashboard yet. The preview is read-only and still-image based. Runtime WebSocket viewport streaming and dashboard-created sessions remain future work in the Firefox backend. Use <code>record start</code> / <code>record stop</code> for screenshot-sequence recording; native WebM/video recording is not implemented."),
];

export default page({
  path: "/dashboard/",
  title: "Dashboard",
  description: "Local status, session, and profile observability dashboard.",
  badge: "Partial",
  blocks: dashboardBlocks,
});
