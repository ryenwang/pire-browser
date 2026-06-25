import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const profilerBlocks = [
  statusNote("profiler"),
  h2("Current performance evidence", "current-performance-evidence"),
  code(`pire-browser wait --selector "#ready" --timeout 10000
pire-browser wait --load networkidle
pire-browser trace start
pire-browser trace stop trace.json
pire-browser screenshot page.png
pire-browser snapshot -i --compact`),
  p("Use waits, Firefox trace QA bundles, screenshots, and compact snapshots for now. Chrome performance traces and CPU profile artifacts require another backend."),
];

export default page({
  path: "/profiler/",
  title: "Profiler",
  description: "Current performance evidence and future profiler direction.",
  badge: "Coming soon",
  blocks: profilerBlocks,
});
