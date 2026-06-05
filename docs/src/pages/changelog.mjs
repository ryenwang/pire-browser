import { h2, list, p, page } from "../blocks.mjs";

const changelogBlocks = [
  h2("0.0.0", "0-0-0"),
  list([
    "Initial public baseline for <code>pire-browser</code>.",
    "Ships local Firefox automation, Pi extension adapters, installed-agent guidance, public docs, and packaging metadata from a fresh public Git history.",
  ]),
  h2("Current package", "current-package"),
  p("The npm package is currently <code>pire-browser@0.0.0</code>. Release details remain authoritative in the repository README and GitHub release artifacts."),
];

export default page({
  path: "/changelog/",
  title: "Changelog",
  description: "Public site and package changes.",
  blocks: changelogBlocks,
});
