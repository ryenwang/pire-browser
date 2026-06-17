import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const reactBlocks = [
  h2("Web Vitals", "web-vitals"),
  code(`pire-browser vitals
pire-browser vitals https://app.example.com/dashboard
pire-browser vitals --json`),
  p("<code>vitals</code> reports best-effort page performance signals from Firefox Performance APIs: TTFB, FCP, LCP, CLS, INP, DOMContentLoaded, load, readyState, and captured hydration warnings. Browser-specific signals that Firefox does not expose are reported as unavailable."),
  unavailable("React DevTools commands"),
  h2("Current app inspection", "current-app-inspection"),
  code(`pire-browser snapshot -i
pire-browser get text <sel>
pire-browser eval "document.querySelector('#root')?.textContent"`),
  p("Framework-aware React tree, Suspense, and render profiling commands are not implemented in the Firefox extension backend."),
];

export default page({
  path: "/react/",
  title: "React & Web Vitals",
  description: "Best-effort Web Vitals and current app inspection workflows.",
  badge: "Partial",
  blocks: reactBlocks,
});
