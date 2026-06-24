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
  h2("Current debug alternatives", "current-debug-alternatives"),
  code(`pire-browser snapshot -i
pire-browser get text <sel>
pire-browser get html <sel>
pire-browser eval "document.title"
pire-browser screenshot debug.png`),
  h2("Unavailable debug tools", "unavailable-debug-tools"),
  list(["Trace capture", "Chrome DevTools inspect proxy", "CPU profiler", "Video recording"]),
];

export default page({
  path: "/debugging/",
  title: "Debugging",
  description: "Console, errors, and debug commands.",
  blocks: debuggingBlocks,
});
