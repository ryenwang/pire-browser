import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const iosBlocks = [
  statusNote("ios"),
  h2("Current status", "current-status"),
  p("pire-browser currently targets desktop Firefox through a WebExtension and Native Messaging host. iOS Simulator, Appium, and real-device Safari control require a backend that is not shipped in the public package."),
  h2("Local alternative", "local-alternative"),
  code(`pire-browser open https://example.com
pire-browser snapshot -i
pire-browser screenshot page.png`),
];

export default page({
  path: "/ios/",
  title: "iOS Simulator",
  description: "Runtime boundary for iOS simulator workflows.",
  blocks: iosBlocks,
});
