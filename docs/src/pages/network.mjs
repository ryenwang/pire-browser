import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const networkBlocks = [
  statusNote("networkControls"),
  h2("Current controls", "current-controls"),
  code(`pire-browser --allowed-domains "example.com,*.example.com" open https://example.com
PIRE_BROWSER_ALLOWED_DOMAINS="example.com" pire-browser snapshot -i
pire-browser open https://api.example.com --headers '{"Authorization":"Bearer token"}'
pire-browser set headers '{"X-Custom-Header":"value"}'
pire-browser wait --load networkidle
pire-browser network requests
pire-browser network requests --filter /api/
pire-browser network request <requestId>
pire-browser network har
pire-browser network har network.har --filter /api/
pire-browser network route "**/api/config**" --body '{"ready":true}'
pire-browser network route "*" --abort --resource-type script
pire-browser network unroute "*"
pire-browser network requests --clear`),
  p("These are Firefox-backed guardrails, request-header helpers, network-idle waits, recent active-tab request diagnostics, metadata-only HAR export, and best-effort route interception. Route rules are scoped to the active tab. Body mocks use a WebExtension redirect, so they are useful for QA flows but are not full CDP response fulfillment."),
  h2("Remaining gaps", "remaining-gaps"),
  list([
    "Response body inspection and raw request/response headers.",
    "Full CDP-style route fulfillment with arbitrary status, headers, and streaming bodies.",
  ]),
];

export default page({
  path: "/network/",
  title: "Network",
  description: "Network guardrails, diagnostics, and best-effort route controls.",
  blocks: networkBlocks,
});
