import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const streamingBlocks = [
  statusNote("dashboard", "Dashboard-backed WebSocket screenshot stream controls are available."),
  h2("Dashboard-backed WebSocket stream", "dashboard-backed-websocket-stream"),
  code(`pire-browser stream enable
pire-browser stream status --json
pire-browser stream disable`),
  p("<code>stream enable</code> starts the local dashboard in the background and exposes <code>ws://127.0.0.1:&lt;port&gt;/api/stream</code>. Clients receive JSON <code>frame</code> messages with base64 PNG visible-viewport screenshots and can send <code>input_mouse</code>, <code>input_keyboard</code>, or <code>input_touch</code> events. The dashboard UI still polls preview images for its own display."),
  table(["Field", "Meaning"], [
    ["transport", "<code>dashboard-websocket-screenshot</code> when enabled"],
    ["webSocketStreaming", "<code>true</code> when enabled"],
    ["remoteInput", "<code>true</code> when enabled"],
    ["webSocketUrl", "The local <code>ws://127.0.0.1:&lt;port&gt;/api/stream</code> endpoint"],
    ["liveViewportKind", "<code>websocket-screenshot-stream</code>"],
    ["dashboardUrl", "The local dashboard URL when the preview service is running"],
  ]),
  h2("Protocol", "protocol"),
  code(`// Receive frames
{"type":"frame","data":"<base64-png>","metadata":{"deviceWidth":1280,"deviceHeight":720}}

// Send mouse input
{"type":"input_mouse","eventType":"mousePressed","x":100,"y":200,"button":"left"}

// Send keyboard input
{"type":"input_keyboard","eventType":"keyDown","key":"Enter","code":"Enter"}

// Send touch-shaped input
{"type":"input_touch","eventType":"touchStart","touchPoints":[{"x":100,"y":200}]}`, "json"),
  p("Mouse and touch-shaped events are mapped onto existing Firefox WebExtension page-level mouse commands. Keyboard events act at the current page focus, so focus or click the intended control first."),
  h2("Evidence alternatives", "evidence-alternatives"),
  code(`pire-browser screenshot page.png
pire-browser record start
pire-browser record start recording-dir https://app.example.com
pire-browser record restart next-recording-dir
pire-browser record stop recording-dir
pire-browser dashboard start --background
pire-browser status --json
pire-browser session list --json`),
  p("Use screenshots, screenshot-sequence recording bundles, and status output for scriptable evidence. <code>record restart</code> stops the current screenshot sequence if present and starts the next one. The stream is screenshot-frame JSON, not native WebM video or Chrome DevTools screencast output."),
];

export default page({
  path: "/streaming/",
  title: "Streaming",
  description: "Current live preview and capture options.",
  badge: "Partial",
  blocks: streamingBlocks,
});
