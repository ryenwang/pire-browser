import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const initScriptsBlocks = [
  statusNote("initScripts"),
  h2("One-navigation script", "one-navigation-script"),
  code(`pire-browser open --init-script ./before-load.js https://example.com`),
  h2("Runtime registration", "runtime-registration"),
  code(`pire-browser addinitscript "window.__flag = true"
pire-browser removeinitscript init1`),
  p("<code>open --init-script</code> applies to one navigation. <code>addinitscript</code> registers for future navigations in the current managed Firefox session and returns an identifier for <code>removeinitscript</code>. Verify with a fresh snapshot or page state because Firefox injection timing can differ from Chrome/CDP.")
];

export default page({
  path: "/init-scripts/",
  title: "Init Scripts",
  description: "Pre-navigation and runtime script injection.",
  blocks: initScriptsBlocks,
});
