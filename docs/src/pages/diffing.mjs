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
pire-browser diff screenshot --baseline before.png
pire-browser diff screenshot --baseline before.png -o diff.png
pire-browser diff screenshot --baseline before.png -t 0.2

pire-browser screenshot after.png
pire-browser diff screenshot --baseline before.png after.png`),
  p("<code>diff screenshot</code> compares a baseline image to a freshly captured active-page screenshot, or to an explicit current image path. Use <code>-o</code> to write a red pixel-diff image and <code>-t</code> to set a 0-1 per-channel threshold."),
  h2("URL diff", "url-diff"),
  p("URL diff commands are not implemented yet. Use explicit open, wait, snapshot, screenshot, and diff commands while URL-level comparison remains a future compatibility target."),
];

export default page({
  path: "/diffing/",
  title: "Diffing",
  description: "Snapshot diffing and current visual comparison workflow.",
  badge: "Partial",
  blocks: diffingBlocks,
});
