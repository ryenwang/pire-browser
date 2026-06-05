import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const proxyBlocks = [
  statusNote("proxy"),
  h2("Current controls", "current-controls"),
  code(`pire-browser --allowed-domains "example.com" open https://example.com
pire-browser open https://api.example.com --headers '{"Authorization":"Bearer token"}'
pire-browser set headers '{"X-Custom-Header":"value"}'`),
  p("Proxy URLs, bypass lists, and proxy credentials are not part of the current Firefox-backed package."),
];

export default page({
  path: "/proxy/",
  title: "Proxy",
  description: "Current network controls and future proxy direction.",
  badge: "Coming soon",
  blocks: proxyBlocks,
});
