import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const recordingBlocks = [
  unavailable("Video recording"),
  h2("Screenshot capture", "screenshot-capture"),
  code(`pire-browser screenshot page.png
pire-browser screenshot --screenshot-dir ./shots page.png`),
  p("The current Firefox backend captures visible viewport and stitched full-page screenshots. Saved WebM recording is not implemented."),
];

export default page({
  path: "/recording/",
  title: "Video Recording",
  description: "Current screenshot capture and future recording direction.",
  badge: "Coming soon",
  blocks: recordingBlocks,
});
