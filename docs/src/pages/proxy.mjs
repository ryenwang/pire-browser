import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const proxyBlocks = [
  statusNote("proxy"),
  h2("Usage", "usage"),
  code(`pire-browser --proxy http://proxy.example:8080 open https://example.com
pire-browser --proxy socks5://proxy.example:1080 --proxy-bypass "localhost,*.internal" open https://example.com
PIRE_BROWSER_PROXY=http://proxy.example:8080 pire-browser open https://httpbin.org/ip
NO_PROXY=localhost,127.0.0.1 pire-browser --proxy http://proxy.example:8080 open https://example.com`),
  p("<code>--proxy</code> applies Firefox proxy settings through the managed WebExtension before browser bridge commands run. Prefer <code>--proxy ... open &lt;url&gt;</code> over <code>launch --url</code> when the first navigation must use the proxy."),
  h2("Authentication", "authentication"),
  code(`pire-browser --proxy http://user:pass@proxy.example:8080 open https://example.com
PIRE_BROWSER_PROXY=http://proxy.example:8080 \\
PIRE_BROWSER_PROXY_USERNAME=user \\
PIRE_BROWSER_PROXY_PASSWORD=pass \\
pire-browser open https://example.com`),
  p("Proxy credentials can be provided in the proxy URL or with <code>PIRE_BROWSER_PROXY_USERNAME</code> / <code>PIRE_BROWSER_PROXY_PASSWORD</code>. Agent-browser-compatible aliases <code>AGENT_BROWSER_PROXY</code>, <code>AGENT_BROWSER_PROXY_BYPASS</code>, <code>AGENT_BROWSER_PROXY_USERNAME</code>, and <code>AGENT_BROWSER_PROXY_PASSWORD</code> are accepted. Credentials stay in extension memory and are not echoed in command output."),
  h2("Limits", "limits"),
  p("This is a Firefox WebExtension proxy path. It does not implement TLS-ignore launch flags, full CDP network routing, or OS-level proxy changes. Firefox may require private-window proxy permission depending on extension settings."),
];

export default page({
  path: "/proxy/",
  title: "Proxy",
  description: "Firefox-backed proxy settings for managed browser commands.",
  badge: "Best effort",
  blocks: proxyBlocks,
});
