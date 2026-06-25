import { code, h2, p, page } from "../blocks.mjs";

const reactBlocks = [
  h2("React Fiber Inspection", "react-fiber-inspection"),
  code(`pire-browser open --enable react-devtools https://app.example.com
pire-browser react tree
pire-browser react tree --selector "#root" --depth 3
pire-browser react inspect r1
pire-browser react inspect '@e1'
pire-browser react renders start
# interact with the page
pire-browser react renders stop
pire-browser react suspense
pire-browser react suspense --only-dynamic`),
  p("<code>react tree</code>, <code>react inspect</code>, <code>react renders</code>, and <code>react suspense</code> mirror agent-browser's React command shape using best-effort Firefox Fiber data attached to DOM nodes. Run <code>react tree</code> after route changes or large DOM updates before reusing an <code>rN</code> component id."),
  p("<code>open --enable react-devtools</code> installs a lightweight hook before page JavaScript runs. Use <code>react renders start</code> before the interaction of interest, then <code>react renders stop</code> to print the profile. <code>react suspense --only-dynamic</code> focuses on currently fallback/dehydrated Suspense boundaries visible through DOM-attached Fiber data."),
  h2("Web Vitals", "web-vitals"),
  code(`pire-browser vitals
pire-browser vitals https://app.example.com/dashboard
pire-browser vitals --json`),
  p("<code>vitals</code> reports best-effort page performance signals from Firefox Performance APIs: TTFB, FCP, LCP, CLS, INP, DOMContentLoaded, load, readyState, and captured hydration warnings. Browser-specific signals that Firefox does not expose are reported as unavailable."),
  h2("Current app inspection", "current-app-inspection"),
  code(`pire-browser snapshot -i
pire-browser get text <sel>
pire-browser eval "document.querySelector('#root')?.textContent"`),
  p("Use snapshots and targeted reads alongside React inspection when the page does not expose Fiber data or when you need DOM-level evidence."),
];

export default page({
  path: "/react/",
  title: "React & Web Vitals",
  description: "Best-effort React Fiber, Web Vitals, and current app inspection workflows.",
  badge: "Partial",
  blocks: reactBlocks,
});
