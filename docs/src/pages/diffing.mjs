import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const diffingBlocks = [
  h2("Snapshot diff", "snapshot-diff"),
  code(`pire-browser snapshot -i
pire-browser click '@e4'
pire-browser diff snapshot

pire-browser diff snapshot --baseline before.txt
pire-browser diff snapshot --selector "#main" --compact`),
  p("<code>diff snapshot</code> compares a fresh active-page snapshot to the previous snapshot captured in the active tab. With <code>--baseline</code>, the CLI reads a local text file and compares the current snapshot to that file instead."),
  h2("Manual comparison workflow", "manual-comparison-workflow"),
  code(`pire-browser snapshot -i > before.txt
pire-browser click '@e4'
pire-browser snapshot -i > after.txt
git diff --no-index before.txt after.txt`),
  h2("Screenshot comparison", "screenshot-comparison"),
  code(`pire-browser screenshot before.png
# perform action
pire-browser screenshot after.png`),
  p("Screenshot, URL, and visual pixel diff commands are not implemented yet. Capture screenshots and compare them with external image tools when a visual diff is required."),
];

export default page({
  path: "/diffing/",
  title: "Diffing",
  description: "Snapshot diffing and current visual comparison workflow.",
  badge: "Partial",
  blocks: diffingBlocks,
});
