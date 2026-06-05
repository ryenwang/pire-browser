import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../../blocks.mjs";

const chromeBlocks = [
  statusNote("chromeEngine"),
  h2("Current engine", "current-engine"),
  code(`pire-browser install
pire-browser open https://example.com
pire-browser snapshot -i`),
  p("pire-browser is intentionally Firefox-backed today. Chrome/CDP-specific features require a different engine."),
  h2("Firefox boundary", "firefox-boundary"),
  code(`# These Chrome engine commands are not available in pire-browser today:
pire-browser connect 9222
pire-browser --cdp 9222 snapshot`, "bash", { notAvailable: true }),
];

export default page({
  path: "/engines/chrome/",
  title: "Chrome",
  description: "Chrome boundary for the Firefox runtime.",
  blocks: chromeBlocks,
});
