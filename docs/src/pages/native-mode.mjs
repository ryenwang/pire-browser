import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const nativeModeBlocks = [
  h2("Overview", "overview"),
  p("Native mode for pire-browser means the Firefox Native Messaging bridge between the CLI and extension."),
  h2("Setup", "setup"),
  code(`pire-browser install
pire-browser doctor`),
  h2("Runtime path", "runtime-path"),
  ol([
    "The CLI parses the command and selects a session.",
    "The native host forwards a JSON request to the Firefox extension.",
    "The extension acts on the active page and returns a compact result.",
  ]),
];

export default page({
  path: "/native-mode/",
  title: "Native Mode",
  description: "Firefox Native Messaging runtime model.",
  blocks: nativeModeBlocks,
});
