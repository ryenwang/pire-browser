import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const reactBlocks = [
  unavailable("React DevTools and Web Vitals commands"),
  h2("Current app inspection", "current-app-inspection"),
  code(`pire-browser snapshot -i
pire-browser get text <sel>
pire-browser eval "document.querySelector('#root')?.textContent"`),
  p("Framework-aware React tree, Suspense, render profiling, and vitals commands are not implemented in the Firefox extension backend."),
];

export default page({
  path: "/react/",
  title: "React & Web Vitals",
  description: "Current app inspection and future framework-aware diagnostics.",
  badge: "Coming soon",
  blocks: reactBlocks,
});
