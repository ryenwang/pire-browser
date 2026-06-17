import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const filesBlocks = [
  h2("Downloads", "downloads"),
  code(`pire-browser download '@e4' ./downloads/report.txt
pire-browser wait --download ./downloads/report.txt --timeout 60000`),
  h2("Uploads", "uploads"),
  code(`pire-browser upload '#file' ./path/to/file.txt
pire-browser upload '#multi-file' ./one.txt ./two.json --json`),
  p("Uploads are limited to small text-safe payloads, capped at 512 KiB total raw bytes. Native OS file-picker control is not implemented."),
  h2("Clipboard", "clipboard"),
  code(`pire-browser clipboard read
pire-browser clipboard write "hello"
pire-browser clipboard copy
pire-browser clipboard paste`),
  h2("Local files", "local-files"),
  code(`pire-browser open file:///path/to/page.html
pire-browser screenshot output.png`),
  h2("Screenshots", "screenshots"),
  statusNote("screenshots"),
  code(`pire-browser screenshot page.png
pire-browser screenshot --screenshot-dir ./shots page.png
pire-browser screenshot --screenshot-dir ./shots
pire-browser screenshot --screenshot-format jpeg --screenshot-quality 80 page.jpg
pire-browser screenshot --full page.png      # Scroll and stitch full page
pire-browser screenshot --annotate page.png  # Adds best-effort numbered visible-element overlays
pire-browser pdf page.pdf
pire-browser pdf viewport.pdf --viewport`),
  p("<code>--full</code> scrolls and stitches the page into one full-document image. <code>--annotate</code> temporarily draws numbered overlays for actionable elements before capture and clears them afterwards. <code>pdf &lt;path&gt;</code> embeds a screenshot into a one-page image-backed PDF for visual evidence; text is not selectable and print CSS is not applied. <code>--screenshot-dir</code> writes the explicit filename there, or generates a timestamped filename in that directory when no filename is provided. Relative screenshot paths resolve from the command's current working directory."),
];

export default page({
  path: "/files/",
  title: "Files & Clipboard",
  description: "Downloads, uploads, clipboard, and local files.",
  blocks: filesBlocks,
});
