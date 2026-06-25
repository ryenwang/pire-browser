import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const profilerBlocks = [
  statusNote("profiler"),
  h2("Firefox profiler", "firefox-profiler"),
  code(`pire-browser profiler start
pire-browser open https://app.example.com
pire-browser click '@e1'
pire-browser profiler status
pire-browser profiler stop profile.json`),
  p("<code>profiler start</code> / <code>profiler stop [output.json]</code> records best-effort Firefox Performance Timeline evidence for the active tab. The output is Chrome Trace Event-shaped JSON, so timing data can be inspected in trace viewers such as Perfetto."),
  h2("Categories", "categories"),
  code(`pire-browser profiler start --categories "devtools.timeline,v8.execute,blink.user_timing"`),
  p("<code>--categories</code> is accepted for agent-browser command-shape compatibility and is recorded as metadata only. Firefox WebExtensions do not expose Chrome trace categories or JavaScript CPU sampling."),
  h2("Use with other evidence", "use-with-other-evidence"),
  code(`pire-browser trace start
pire-browser profiler start
pire-browser snapshot -i
pire-browser profiler stop profile.json
pire-browser trace stop trace.json
pire-browser screenshot page.png`),
  p("Use profiler bundles for timing evidence, trace bundles for console/page-error/network/vitals/snapshot/screenshot context, and screenshots or screenshot-sequence recordings for visual evidence."),
  h2("Limits", "limits"),
  list(["Not a Chrome DevTools CPU profile", "Not a sampling JavaScript profiler", "Not a full renderer timeline", "Captures Performance Timeline entries visible to Firefox content scripts"]),
];

export default page({
  path: "/profiler/",
  title: "Profiler",
  description: "Best-effort Firefox performance profiler evidence.",
  blocks: profilerBlocks,
});
