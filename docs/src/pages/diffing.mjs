import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const diffingBlocks = [
  unavailable("Snapshot and screenshot diff commands"),
  h2("Manual comparison workflow", "manual-comparison-workflow"),
  code(`pire-browser snapshot -i > before.txt
pire-browser click '@e4'
pire-browser snapshot -i > after.txt
git diff --no-index before.txt after.txt`),
  h2("Screenshot comparison", "screenshot-comparison"),
  code(`pire-browser screenshot before.png
# perform action
pire-browser screenshot after.png`),
  p("A future diff command can compare these artifacts directly; today the CLI focuses on capture, ref-oriented action, and repeatable setup through <code>--state &lt;path&gt;</code> when saved active-origin state helps recreate the same page."),
];

export default page({
  path: "/diffing/",
  title: "Diffing",
  description: "Current capture comparison workflow and future diffing direction.",
  badge: "Coming soon",
  blocks: diffingBlocks,
});
