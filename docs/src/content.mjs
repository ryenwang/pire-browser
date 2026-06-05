import { pages } from "./pages/index.mjs";

const GITHUB_URL = "https://github.com/ryenwang/pire-browser";
const NPM_URL = "https://www.npmjs.com/package/pire-browser";

export const site = {
  name: "pire-browser",
  description: "Firefox-backed browser automation CLI and Pi extension for AI agents",
  basePath: "/pire-browser",
  canonicalOrigin: "https://ryenwang.github.io/pire-browser",
  githubUrl: GITHUB_URL,
  npmUrl: NPM_URL,
};

export const navGroups = [
  {
    label: null,
    links: [
      { title: "Introduction", path: "/" },
      { title: "Installation", path: "/installation/" },
      { title: "Quick Start", path: "/quick-start/" },
      { title: "Skills", path: "/skills/" },
    ],
  },
  {
    label: "Reference",
    links: [
      { title: "Commands", path: "/commands/" },
      { title: "Configuration", path: "/configuration/" },
      { title: "Selectors", path: "/selectors/" },
      { title: "Snapshots", path: "/snapshots/" },
    ],
  },
  {
    label: "Features",
    links: [
      { title: "Sessions", path: "/sessions/" },
      { title: "Dashboard", path: "/dashboard/" },
      { title: "Diffing", path: "/diffing/" },
      { title: "Network", path: "/network/" },
      { title: "CDP Mode", path: "/cdp-mode/" },
      { title: "Streaming", path: "/streaming/" },
      { title: "Video Recording", path: "/recording/" },
      { title: "Debugging", path: "/debugging/" },
      { title: "Profiler", path: "/profiler/" },
      { title: "React & Web Vitals", path: "/react/" },
      { title: "Files & Clipboard", path: "/files/" },
      { title: "Init Scripts", path: "/init-scripts/" },
      { title: "Proxy", path: "/proxy/" },
      { title: "iOS Simulator", path: "/ios/" },
      { title: "Security", path: "/security/" },
      { title: "Next.js + Vercel", path: "/next/" },
      { title: "Native Mode", path: "/native-mode/" },
    ],
  },
  {
    label: "Providers",
    links: [
      { title: "AgentCore", path: "/providers/agentcore/" },
      { title: "Browser Use", path: "/providers/browser-use/" },
      { title: "Browserbase", path: "/providers/browserbase/" },
      { title: "Browserless", path: "/providers/browserless/" },
      { title: "Kernel", path: "/providers/kernel/" },
    ],
  },
  {
    label: "Engines",
    links: [
      { title: "Chrome", path: "/engines/chrome/" },
      { title: "Lightpanda", path: "/engines/lightpanda/" },
    ],
  },
  {
    label: null,
    links: [{ title: "Changelog", path: "/changelog/" }],
  },
];

export { pages };
