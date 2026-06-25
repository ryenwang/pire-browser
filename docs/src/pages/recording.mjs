import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const recordingBlocks = [
  statusNote("debugging", "Screenshot-sequence recording bundles are available for active Firefox tabs. Native WebM/video recording and live viewport streaming are not implemented."),
  h2("Screenshot-sequence recording", "screenshot-sequence-recording"),
  code(`pire-browser record start
pire-browser record status
pire-browser record stop recording-dir`),
  p("<code>record start</code> captures bounded visible-viewport PNG frames from the active tab. <code>record status</code> reports whether recording is active and how many frames are buffered. <code>record stop [output-dir]</code> writes the frame images plus <code>recording.json</code>."),
  note("This is a QA evidence bundle, not native WebM video, live viewport streaming, or Chrome DevTools screencast output.", "warn"),
  h2("Screenshot capture", "screenshot-capture"),
  code(`pire-browser screenshot page.png
pire-browser screenshot --screenshot-dir ./shots page.png
pire-browser pdf page.pdf`),
  p("The current Firefox backend also captures visible viewport screenshots, stitched full-page screenshots, and image-backed PDF evidence."),
];

export default page({
  path: "/recording/",
  title: "Recording",
  navTitle: "Recording",
  description: "Screenshot-sequence recording and screenshot capture.",
  badge: "Best effort",
  blocks: recordingBlocks,
});
