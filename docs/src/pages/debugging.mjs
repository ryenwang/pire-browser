import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const debuggingBlocks = [
  statusNote("debugging"),
  h2("Console and errors", "console-and-errors"),
  code(`pire-browser console
pire-browser console --json
pire-browser console --clear
pire-browser errors
pire-browser errors --clear`),
  p("Use these after navigation, login, or failed actions to inspect page-world console messages, uncaught errors, and unhandled promise rejections captured by the Firefox content script."),
  h2("Dialogs", "dialogs"),
  statusNote("dialogs"),
  code(`pire-browser dialog status
pire-browser dialog accept [text]
pire-browser dialog dismiss
pire-browser snapshot -i`),
  p("Use these when command output includes PAGE_DIALOG warnings. Firefox dialog control is page-shimmed best effort; re-run snapshot after handling a dialog before using old refs."),
  h2("Highlight", "highlight"),
  code(`pire-browser highlight '@e2'
pire-browser highlight '#submit'
pire-browser screenshot highlighted-target.png`),
  p("Use highlight before screenshots when a QA report needs to show the intended element. The overlay is Firefox-specific and best-effort."),
  h2("Trace bundle", "trace-bundle"),
  code(`pire-browser trace start
pire-browser open https://app.example.com
pire-browser snapshot -i
pire-browser trace status
pire-browser trace stop trace.json`),
  p("<code>trace start</code> / <code>trace stop</code> records a Firefox QA evidence bundle with WebExtension-observable console messages, page errors, network/HAR metadata, best-effort vitals, compact snapshot text, and screenshot evidence. It is not a Chrome DevTools performance trace, CPU profile, or native WebM video recording."),
  h2("Profiler bundle", "profiler-bundle"),
  code(`pire-browser profiler start
pire-browser open https://app.example.com
pire-browser click '@e1'
pire-browser profiler status
pire-browser profiler stop profile.json`),
  p("<code>profiler start</code> / <code>profiler stop</code> writes Chrome Trace Event-shaped JSON from Firefox Performance Timeline entries. Use it for navigation, resource, paint, mark, measure, and long-entry timing evidence. It is not Chrome DevTools CPU sampling or a full renderer timeline."),
  h2("Recording bundle", "recording-bundle"),
  code(`pire-browser record start
pire-browser open https://app.example.com
pire-browser snapshot -i
pire-browser record status
pire-browser record stop recording-dir`),
  p("<code>record start</code> / <code>record stop</code> records bounded visible-viewport PNG frames for the active Firefox tab and writes frame files plus <code>recording.json</code>. It is a screenshot-sequence QA evidence bundle, not native WebM video, WebSocket viewport streaming, or Chrome DevTools screencast output."),
  h2("Current debug alternatives", "current-debug-alternatives"),
  code(`pire-browser snapshot -i
pire-browser get text <sel>
pire-browser get html <sel>
pire-browser eval "document.title"
pire-browser screenshot debug.png`),
  h2("Unavailable debug tools", "unavailable-debug-tools"),
  list(["Chrome DevTools inspect proxy", "Chrome CPU sampling profiler", "Native WebM video recording", "WebSocket viewport streaming"]),
];

export default page({
  path: "/debugging/",
  title: "Debugging",
  description: "Console, errors, and debug commands.",
  blocks: debuggingBlocks,
});
