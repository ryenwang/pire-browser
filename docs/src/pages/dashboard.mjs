import { code, h2, p, page, statusNote } from "../blocks.mjs";

const dashboardBlocks = [
  statusNote("dashboard"),
  h2("Usage", "usage"),
  code(`pire-browser dashboard start
pire-browser dashboard start --port 4848
pire-browser dashboard start --port 0 --json`),
  p("The dashboard is a foreground localhost server bound to <code>127.0.0.1</code>. Open the printed URL to inspect install health, live Firefox sessions, managed profiles, and capability notes. Press <code>Ctrl+C</code> in the terminal to stop it."),
  h2("Current observability", "current-observability"),
  code(`pire-browser dashboard start
pire-browser status
pire-browser status --json
pire-browser session list --json
pire-browser profiles --json
pire-browser doctor --json
pire-browser --auto-connect state save ./.pire-state/current.json`),
  p("Use the dashboard for a live local summary, and use the CLI commands above when scripts or agents need structured output."),
  h2("Limits", "limits"),
  p("This is not the full agent-browser live viewport dashboard yet. Runtime WebSocket viewport streaming, command activity feed events, dashboard-created sessions, and video recording remain future work in the Firefox backend."),
];

export default page({
  path: "/dashboard/",
  title: "Dashboard",
  description: "Local status, session, and profile observability dashboard.",
  badge: "Partial",
  blocks: dashboardBlocks,
});
