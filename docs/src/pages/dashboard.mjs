import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const dashboardBlocks = [
  unavailable("The observability dashboard"),
  h2("Current observability", "current-observability"),
  code(`pire-browser status
pire-browser status --json
pire-browser session list --json
pire-browser profiles --json
pire-browser doctor --json
pire-browser --auto-connect state save ./.pire-state/current.json`),
  p("Use these commands to inspect live sessions, managed profiles, active pages, local setup health, and active-origin state until a dashboard server exists."),
];

export default page({
  path: "/dashboard/",
  title: "Dashboard",
  description: "Current observability commands and future dashboard direction.",
  badge: "Coming soon",
  blocks: dashboardBlocks,
});
