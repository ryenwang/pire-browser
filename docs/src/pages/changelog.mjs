import { h2, list, p, page } from "../blocks.mjs";

const changelogBlocks = [
  h2("0.2.3", "0-2-3"),
  list([
    "Adds deterministic Pi duplicate-install recovery with <code>pire-browser pi conflicts</code> and <code>pire-browser pi repair</code>.",
    "Keeps old GitHub/local/ZIP-era install cleanup conservative, report-backed, and available through <code>npx -y pire-browser@latest pi repair</code> when Pi cannot start.",
  ]),
  h2("0.2.2", "0-2-2"),
  list([
    "Published public npm baseline for <code>pire-browser</code>.",
    "Ships local Firefox automation, Pi extension adapters, installed-agent guidance, public docs, and version-matched optional native packages.",
  ]),
  h2("Current package", "current-package"),
  p("The npm package is currently <code>pire-browser@0.2.3</code>. Release details remain authoritative in the repository README and GitHub release artifacts."),
];

export default page({
  path: "/changelog/",
  title: "Changelog",
  description: "Public site and package changes.",
  blocks: changelogBlocks,
});
