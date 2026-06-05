import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const cdpBlocks = [
  unavailable("Chrome DevTools Protocol mode"),
  h2("Firefox backend", "firefox-backend"),
  p("pire-browser commands are mediated by Firefox WebExtension APIs and Native Messaging. A browser CDP WebSocket is not exposed."),
  h2("Runtime boundary", "runtime-boundary"),
  code(`# These Chrome/CDP command shapes are not available in pire-browser today.
pire-browser connect <port-or-url>
pire-browser --cdp <port-or-url> open https://example.com`, "bash", { notAvailable: true }),
];

export default page({
  path: "/cdp-mode/",
  title: "CDP Mode",
  description: "Firefox runtime boundary for CDP workflows.",
  blocks: cdpBlocks,
});
