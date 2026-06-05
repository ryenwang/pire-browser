import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../../blocks.mjs";

const lightpandaBlocks = [
  statusNote("lightpandaEngine"),
  h2("Current engine", "current-engine"),
  p("The shipped runtime uses Firefox, not Lightpanda."),
  h2("Local workflow", "local-workflow"),
  code(`pire-browser open https://example.com
pire-browser snapshot -i`),
];

export default page({
  path: "/engines/lightpanda/",
  title: "Lightpanda",
  description: "Lightpanda boundary for the Firefox runtime.",
  blocks: lightpandaBlocks,
});
