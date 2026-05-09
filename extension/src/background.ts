{
type RpcRequest = {
  type: "request";
  id: string;
  method: string;
  params?: Record<string, any>;
};

type RpcResponse = {
  type: "response";
  id: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    data?: unknown;
  };
};

type NativeEvent = {
  type: "event";
  name: string;
  data?: Record<string, unknown>;
};

type NonHandleLocator =
  | { kind: "role"; role: string; name?: string; index: number }
  | { kind: "label"; text: string; index: number }
  | { kind: "text"; text: string; index: number }
  | { kind: "placeholder"; text: string; index: number }
  | { kind: "testid"; value: string; index: number }
  | { kind: "css"; selector: string; index: number }
  | { kind: "xpath"; expression: string; index: number }
  | { kind: "alt"; text: string; index: number }
  | { kind: "title"; text: string; index: number };

type Locator = NonHandleLocator | { kind: "handle"; handle: string; fallback: NonHandleLocator };

type ElementSnapshot = {
  ref?: string;
  role: string;
  name: string;
  text: string;
  label: string;
  placeholder: string;
  testid: string;
  disabled: boolean;
  visible: boolean;
  bounds: { x: number; y: number; width: number; height: number };
  locator: Locator;
};

type FrameSnapshot = {
  frameId: number;
  url?: string;
  title?: string;
  opaque?: boolean;
  elements: ElementSnapshot[];
  dialogs?: DialogRecord[];
  error?: string;
};

type DialogRecord = {
  type: "alert" | "confirm" | "prompt";
  message: string;
  defaultValue?: string;
  returned: boolean | string | null;
  at: number;
};

type PageRecord = {
  tabId: number;
  windowId: number;
  agentId: string;
  label?: string;
  url?: string;
  title?: string;
  active?: boolean;
  closed?: boolean;
};

type TabRecord = PageRecord;

const HOST_NAME = "dev.pi.pire_browser";
const CHUNK_SIZE = 700_000;

let port: any;
let profileId = "";
let nextTabNumber = 1;
const tabsByBrowserId = new Map<number, TabRecord>();
const tabsByAgentId = new Map<string, TabRecord>();
const labels = new Map<string, string>();
const refs = new Map<string, { tabId: number; frameId: number; locator: Locator; summary: string }>();

connectNative();
registerBrowserListeners();

function connectNative() {
  console.log("[pire-browser] connecting native host", HOST_NAME);
  try {
    port = browser.runtime.connectNative(HOST_NAME);
  } catch (error) {
    console.error("[pire-browser] connectNative threw", error);
    setTimeout(connectNative, 1000);
    return;
  }
  port.onMessage.addListener((message: any) => void handleNativeMessage(message));
  port.onDisconnect.addListener(() => {
    const lastError = browser.runtime.lastError;
    if (lastError) console.error("[pire-browser] native host disconnected", lastError.message);
    setTimeout(connectNative, 1000);
  });

  void ensureProfileId().then(() => {
    console.log("[pire-browser] native host port opened", profileId);
    postNative({
      type: "hello",
      profile_id: profileId,
      extension_id: browser.runtime.id,
      extension_version: browser.runtime.getManifest().version,
    });
    postEvent("focused", {});
    setInterval(() => postEvent("heartbeat", {}), 5000);
  });
}

async function ensureProfileId() {
  const stored = await browser.storage.local.get("profileId");
  if (stored.profileId) {
    profileId = stored.profileId;
  } else {
    profileId = crypto.randomUUID();
    await browser.storage.local.set({ profileId });
  }
}

function postNative(message: Record<string, unknown>) {
  try {
    port?.postMessage(message);
  } catch {
    // Firefox will restart the native host on reconnect.
  }
}

function postEvent(name: string, data: Record<string, unknown>) {
  const event: NativeEvent = {
    type: "event",
    name,
    data: { ...data, profileId },
  };
  postNative(event);
}

async function handleNativeMessage(message: any) {
  if (message.type === "request") {
    const request = message as RpcRequest;
    const response = await executeRequest(request);
    postNative(response);
  }
}

async function executeRequest(request: RpcRequest): Promise<RpcResponse> {
  try {
    if (request.method !== "command") {
      return errorResponse(request.id, "unsupported_method", `Unsupported method: ${request.method}`);
    }
    const args = Array.isArray(request.params?.args) ? (request.params?.args as string[]) : [];
    const result = await prepareLargeResult(await executeCommand(args));
    if ("error" in result) {
      return {
        type: "response",
        id: request.id,
        ok: false,
        error: result.error as RpcResponse["error"],
      };
    }
    return {
      type: "response",
      id: request.id,
      ok: true,
      result,
    };
  } catch (error) {
    return errorResponse(request.id, "command_failed", error instanceof Error ? error.message : String(error));
  }
}

function errorResponse(id: string, code: string, message: string): RpcResponse {
  return { type: "response", id, ok: false, error: { code, message } };
}

async function executeCommand(args: string[]): Promise<Record<string, unknown>> {
  const [command, ...rest] = args;
  switch (command) {
    case "status":
      return statusResult();
    case "open":
    case "goto":
    case "navigate":
      return openCommand(rest, command || "open");
    case "snapshot":
      return snapshotCommand(rest);
    case "find":
      return findCommand(rest);
    case "click":
      return clickCommand(rest);
    case "dblclick":
      return targetActionCommand("dblclick", rest);
    case "fill":
      return fillCommand(rest);
    case "type":
      return targetActionCommand("type", rest);
    case "press":
    case "key":
      return pressCommand(rest);
    case "keyboard":
      return keyboardCommand(rest);
    case "keydown":
    case "keyup":
      return keyEdgeCommand(command, rest);
    case "hover":
    case "focus":
    case "scrollintoview":
      return targetActionCommand(command, rest);
    case "select":
      return targetActionCommand("select", rest);
    case "check":
    case "uncheck":
      return targetActionCommand(command, rest);
    case "scroll":
      return scrollCommand(rest);
    case "wait":
      return waitCommand(rest);
    case "screenshot":
      return screenshotCommand(rest);
    case "get":
      return getCommand(rest);
    case "is":
      return isCommand(rest);
    case "eval":
      return evalCommand(rest);
    case "tab":
    case "tabs":
      return tabsCommand(rest);
    case "back":
    case "forward":
    case "reload":
      return navigationCommand(command);
    case "window":
      return windowCommand(rest);
    case "frame":
      return frameCommand(rest);
    case "dialog":
      return dialogCommand(rest);
    case "batch":
      return batchCommand(rest);
    case "cookies":
      return cookiesCommand(rest);
    case "storage":
      return storageCommand(rest);
    case "install":
    case "upgrade":
    case "download":
    case "drag":
    case "upload":
    case "mouse":
    case "clipboard":
    case "set":
    case "network":
    case "stream":
    case "dashboard":
    case "trace":
    case "profiler":
    case "record":
    case "console":
    case "errors":
    case "highlight":
    case "auth":
    case "confirm":
    case "deny":
    case "state":
    case "session":
    case "profiles":
    case "react":
    case "vitals":
    case "addinitscript":
    case "removeinitscript":
    case "pdf":
    case "connect":
    case "pushstate":
    case "diff":
    case "device":
    case "tap":
    case "swipe":
    case "skills":
    case "skill":
      return notAvailable(command, "This agent-browser command is parsed by pire-browser but is not implemented on the Firefox WebExtension backend yet.");
    case "close":
    case "quit":
    case "exit":
      window.close();
      return { text: "pire-browser extension close requested" };
    default:
      return {
        error: {
          code: "unsupported_command",
          message: `Unsupported command: ${command || "(missing)"}`,
        },
      };
  }
}

async function openCommand(args: string[], command = "open") {
  const url = firstPositionalArg(args, ["--label"]);
  if (!url) {
    if (command !== "open") {
      return { error: { code: "invalid_args", message: `${command} requires <url>` } };
    }
    const tab = await targetTab();
    return { text: openTabText(tab), tab };
  }
  const label = valueAfter(args, "--label");
  const newTab = args.includes("--new");
  const active = await activeTab();
  const previousUrl = active?.url;
  const tab = newTab || !active?.id
    ? await browser.tabs.create({ url, active: true })
    : await browser.tabs.update(active.id, { url, active: true });
  await waitForTabReady(tab.id, url, previousUrl, 10000);
  const loadedTab = await browser.tabs.get(tab.id);
  const record = rememberTab(loadedTab);
  if (label) setLabel(record, label);
  await activatePage(record);
  return { text: `Opened ${url} in ${record.agentId}${label ? ` (${label})` : ""}`, tab: record };
}

async function snapshotCommand(args: string[]) {
  const tab = await targetTab();
  const frames = await snapshotTab(tab.tabId);
  refs.clear();
  let refNumber = 1;
  const lines: string[] = [`${tab.agentId} ${tab.title || tab.url || ""}`.trim()];
  const interactive = args.includes("-i") || args.includes("--interactive");

  for (const frame of frames) {
    if (frame.opaque) {
      lines.push(`  frame ${frame.frameId}: opaque ${frame.url ?? ""}`.trim());
      continue;
    }
    for (const element of frame.elements) {
      const ref = `@e${refNumber++}`;
      element.ref = ref;
      refs.set(ref, {
        tabId: tab.tabId,
        frameId: frame.frameId,
        locator: element.locator,
        summary: summarizeElement(element),
      });
      if (interactive) {
        lines.push(`  ${ref} ${summarizeElement(element)}`);
      }
    }
  }

  return withDialogs({ text: lines.join("\n"), frames, refs: Array.from(refs.keys()) }, frames);
}

async function findCommand(args: string[]) {
  const parsed = parseFind(args);
  if ("error" in parsed) return parsed;
  if (parsed.action) return actOnFind(parsed.locator, parsed.action, parsed.text ?? "");

  const tab = await targetTab();
  const frames = await findInTab(tab.tabId, parsed.locator);
  const matches = frames.flatMap((frame) =>
    frame.elements.map((element) => ({ frameId: frame.frameId, element }))
  );
  if (matches.length === 0) {
    return { error: { code: "not_found", message: "No element matched locator" } };
  }
  const lines = matches.map(({ frameId, element }, index) => {
    const ref = `@e${index + 1}`;
    refs.set(ref, {
      tabId: tab.tabId,
      frameId,
      locator: element.locator,
      summary: summarizeElement(element),
    });
    return `${ref} ${summarizeElement(element)}`;
  });
  return withDialogs({ text: lines.join("\n"), frames }, frames);
}

async function clickCommand(args: string[]) {
  const locator = locatorFromTarget(args[0]);
  if ("error" in locator) return locator;
  return clickLocator(locator.locator, locator.frameId);
}

async function fillCommand(args: string[]) {
  const locator = locatorFromTarget(args[0]);
  if ("error" in locator) return locator;
  const text = args.slice(1).join(" ");
  return fillLocator(locator.locator, text, locator.frameId);
}

async function targetActionCommand(action: string, args: string[]) {
  const locator = locatorFromTarget(args[0]);
  if ("error" in locator) return locator;
  const text = args.slice(1).join(" ");
  const tab = await targetTab();
  const payload: Record<string, unknown> = { type: action, locator: locator.locator };
  if (action === "type") payload.text = text;
  if (action === "select") payload.value = text;
  const response = await sendFrame(tab.tabId, locator.frameId, payload);
  return normalizeContentResponse(response);
}

async function actOnFind(locator: Locator, action: string, text = "") {
  const tab = await targetTab();
  const frames = await findInTab(tab.tabId, locator);
  const matches = frames.flatMap((frame) => frame.elements.map(() => frame.frameId));
  if (matches.length === 0) return { error: { code: "not_found", message: "No element matched locator" } };
  if (matches.length > 1) return { error: { code: "ambiguous_locator", message: `${matches.length} elements matched locator` } };
  if (action === "click") return clickLocator(locator, matches[0]);
  if (action === "fill") return fillLocator(locator, text, matches[0]);
  if (["text", "html", "value", "attr", "box", "styles"].includes(action)) {
    const response = await sendFrame(tab.tabId, matches[0], { type: "get", locator, property: action, attribute: text });
    return normalizeContentResponse(response);
  }
  const response = await sendFrame(tab.tabId, matches[0], { type: action, locator, text, value: text, property: action });
  return normalizeContentResponse(response);
}

async function clickLocator(locator: Locator, frameId?: number) {
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, frameId, { type: "click", locator });
  return normalizeContentResponse(response);
}

async function fillLocator(locator: Locator, text: string, frameId?: number) {
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, frameId, { type: "fill", locator, text });
  return normalizeContentResponse(response);
}

async function pressCommand(args: string[]) {
  const key = args[0];
  if (!key) return { error: { code: "invalid_args", message: "press requires <key>" } };
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, undefined, { type: "press", key });
  return normalizeContentResponse(response);
}

async function keyboardCommand(args: string[]) {
  const [subcommand, ...rest] = args;
  if (subcommand !== "type" && subcommand !== "inserttext") {
    return { error: { code: "InvalidArgumentError", message: "keyboard requires type|inserttext <text>" } };
  }
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, undefined, {
    type: subcommand === "type" ? "keyboard_type" : "keyboard_inserttext",
    text: rest.join(" "),
  });
  return normalizeContentResponse(response);
}

async function keyEdgeCommand(command: string, args: string[]) {
  const key = args[0];
  if (!key) return { error: { code: "InvalidArgumentError", message: `${command} requires <key>` } };
  return bestEffortResult(
    `Dispatched ${command} as a press-compatible keyboard event for ${key}`,
    command,
    "Firefox WebExtensions cannot hold OS-level key state; this is a page-dispatched keyboard event approximation."
  );
}

async function scrollCommand(args: string[]) {
  const direction = args[0] ?? "down";
  const pixels = Number(firstPositionalArg(args.slice(1), ["--selector"]) ?? "900");
  const selector = valueAfter(args, "--selector");
  if (!["up", "down", "left", "right"].includes(direction) || !Number.isFinite(pixels) || pixels <= 0) {
    return { error: { code: "InvalidArgumentError", message: "scroll requires up|down|left|right [positive_pixels]" } };
  }
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, undefined, { type: "scroll", direction, pixels, selector });
  return normalizeContentResponse(response);
}

async function waitCommand(args: string[]) {
  const timeoutResult = parseTimeoutOption(args, 10000);
  if ("error" in timeoutResult) return timeoutResult;
  const timeout = timeoutResult.ms;
  const selector = valueAfter(args, "--selector");
  if (args.includes("--load")) {
    await waitForTabComplete((await targetTab()).tabId, timeout);
    return { text: "Page load complete" };
  }
  if (selector) {
    const tab = await targetTab();
    const response = await sendFrame(tab.tabId, undefined, { type: "wait_selector", selector, timeout, state: valueAfter(args, "--state") ?? "visible" });
    return normalizeContentResponse(response);
  }
  const text = valueAfter(args, "--text");
  if (text) {
    const tab = await targetTab();
    const response = await sendFrame(tab.tabId, undefined, { type: "wait_text", text, timeout, hidden: false });
    return normalizeContentResponse(response);
  }
  const urlPattern = valueAfter(args, "--url");
  if (urlPattern) return waitForUrl(urlPattern, timeout);
  const fn = valueAfter(args, "--fn");
  if (fn) {
    const tab = await targetTab();
    const response = await sendFrame(tab.tabId, undefined, { type: "wait_fn", expression: fn, timeout });
    return normalizeContentResponse(response);
  }
  if (args[0] && !args[0].startsWith("--") && Number.isNaN(Number(args[0]))) {
    const tab = await targetTab();
    const response = await sendFrame(tab.tabId, undefined, { type: "wait_selector", selector: args[0], timeout, state: valueAfter(args, "--state") ?? "visible" });
    return normalizeContentResponse(response);
  }
  const waitResult = parsePlainWaitMs(args);
  if ("error" in waitResult) return waitResult;
  await delay(waitResult.ms);
  return { text: `Waited ${waitResult.ms}ms` };
}

async function getCommand(args: string[]) {
  const [property, target, attribute] = args;
  if (property === "title") {
    const tab = await targetTab();
    return { text: tab.title ?? "", value: tab.title ?? "" };
  }
  if (property === "url") {
    const tab = await targetTab();
    return { text: tab.url ?? "", value: tab.url ?? "" };
  }
  if (property === "count") {
    const locator = locatorFromTarget(target);
    if ("error" in locator) return locator;
    const tab = await targetTab();
    const frames = await findInTab(tab.tabId, locator.locator);
    const count = frames.reduce((sum, frame) => sum + frame.elements.length, 0);
    return { text: String(count), value: count };
  }
  if (!target) return { error: { code: "InvalidArgumentError", message: "get requires <property> <selector>" } };
  const locator = locatorFromTarget(target);
  if ("error" in locator) return locator;
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, locator.frameId, { type: "get", locator: locator.locator, property, attribute });
  return normalizeContentResponse(response);
}

async function isCommand(args: string[]) {
  const [state, target] = args;
  if (!state || !target) return { error: { code: "InvalidArgumentError", message: "is requires visible|enabled|checked <selector>" } };
  const locator = locatorFromTarget(target);
  if ("error" in locator) return locator;
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, locator.frameId, { type: "is", locator: locator.locator, state });
  return normalizeContentResponse(response);
}

async function evalCommand(args: string[]) {
  const script = args.join(" ");
  if (!script) return { error: { code: "InvalidArgumentError", message: "eval requires <js>" } };
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, undefined, { type: "eval", script });
  return normalizeContentResponse(response);
}

async function screenshotCommand(args: string[]) {
  const dir = valueAfter(args, "--screenshot-dir");
  const format = valueAfter(args, "--screenshot-format") === "jpeg" ? "jpeg" : "png";
  const quality = Number(valueAfter(args, "--screenshot-quality") ?? "92");
  const positional = firstPositionalArg(args, ["--screenshot-dir", "--screenshot-format", "--screenshot-quality"]);
  const path = dir && positional && !/[\\/]/.test(positional) ? `${dir.replace(/[\\/]$/, "")}/${positional}` : positional ?? `pire-browser-screenshot-${Date.now()}.${format === "jpeg" ? "jpg" : "png"}`;
  const tab = await targetTab();
  await activatePage(tab);
  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format, quality });
  const meta = await sendScreenshotChunks(dataUrl);
  return {
    text: `Screenshot captured for ${path}`,
    screenshot: meta,
    screenshotPath: path,
    warnings: args.includes("--full") || args.includes("--annotate")
      ? [bestEffortWarning("screenshot", "Full-page and annotated screenshots are not implemented yet; captured the visible viewport.")]
      : [],
  };
}

async function navigationCommand(command: string) {
  const tab = await targetTab();
  if (command === "back") await browser.tabs.goBack(tab.tabId);
  if (command === "forward") await browser.tabs.goForward(tab.tabId);
  if (command === "reload") await browser.tabs.reload(tab.tabId);
  return { text: `${command} requested` };
}

async function windowCommand(args: string[]) {
  if (args[0] !== "new") return { error: { code: "InvalidArgumentError", message: "window requires new" } };
  const created = await browser.windows.create({ focused: true });
  return { text: `Opened window ${created.id ?? ""}`.trim(), window: created };
}

async function frameCommand(args: string[]) {
  if (args[0] === "main") return bestEffortResult("Frame targeting reset to main", "frame", "pire-browser currently scopes frame targeting per command rather than storing a persistent frame selection.");
  return bestEffortResult("Frame command accepted", "frame", "pire-browser searches across frames for selectors and refs instead of switching persistent frame context.");
}

async function dialogCommand(args: string[]) {
  return bestEffortResult(
    `Dialog ${args[0] ?? "status"} requested`,
    "dialog",
    "Dialogs are captured by the page shim when injection is allowed; active modal control is best-effort in Firefox WebExtensions."
  );
}

async function batchCommand(args: string[]) {
  const bailOnError = args.includes("--bail");
  const commands = args.filter((arg) => arg !== "--bail");
  const results: Record<string, unknown>[] = [];
  for (const commandText of commands) {
    const result = await executeCommand(splitCommand(commandText));
    results.push(result);
    if (bailOnError && "error" in result) break;
  }
  return { text: `Ran ${results.length} batch command(s)`, results };
}

async function cookiesCommand(args: string[]) {
  const tab = await targetTab();
  if (args[0] === "clear") {
    const cookies = await browser.cookies.getAll({ url: tab.url });
    await Promise.all(cookies.map((cookie: any) => browser.cookies.remove({ url: cookieUrl(cookie), name: cookie.name })));
    return { text: `Cleared ${cookies.length} cookie(s)` };
  }
  if (args[0] === "set") {
    const [, name, value] = args;
    if (!name) return { error: { code: "InvalidArgumentError", message: "cookies set requires <name> <value>" } };
    await browser.cookies.set({ url: tab.url, name, value: value ?? "" });
    return { text: `Set cookie ${name}` };
  }
  const cookies = await browser.cookies.getAll({ url: tab.url });
  return { text: cookies.map((cookie: any) => `${cookie.name}=${cookie.value}`).join("\n"), cookies };
}

async function storageCommand(args: string[]) {
  const area = args[0] === "session" ? "sessionStorage" : "localStorage";
  const op = args[1];
  const key = args[2];
  const value = args.slice(3).join(" ");
  const expression =
    op === "set"
      ? `${area}.setItem(${JSON.stringify(key)}, ${JSON.stringify(value)}); true`
      : op === "clear"
        ? `${area}.clear(); true`
        : key
          ? `${area}.getItem(${JSON.stringify(key)})`
          : `Object.fromEntries(Array.from({length:${area}.length},(_,i)=>{const k=${area}.key(i);return [k,${area}.getItem(k)]}))`;
  const result = await evalCommand([expression]);
  return { ...result, warnings: mergeWarnings((result as any).warnings, [bestEffortWarning("storage", "Storage commands execute in the page context for the active origin.")]) };
}

async function tabsCommand(args: string[]) {
  const [subcommand, target, value] = args;
  await reconcileTabs();
  if (subcommand === "list" || !subcommand) {
    const rows = Array.from(tabsByAgentId.values())
      .filter((tab) => !tab.closed)
      .map((tab) => `${tab.agentId}${tab.label ? ` ${tab.label}` : ""} ${tab.active ? "*" : ""} ${tab.title || tab.url || ""}`.trim());
    return { text: rows.join("\n") || "No tabs tracked", tabs: Array.from(tabsByAgentId.values()) };
  }
  if (subcommand === "new") {
    const label = valueAfter(args, "--label");
    const url = firstPositionalArg(args.slice(1), ["--label"]);
    const created = await browser.tabs.create({ url: url || "about:blank", active: true });
    const record = rememberTab(created);
    if (label) setLabel(record, label);
    return { text: `Opened ${record.agentId}${label ? ` (${label})` : ""}`, tab: record };
  }
  if (subcommand === "select" || findTab(subcommand)) {
    const tab = findTab(subcommand === "select" ? target : subcommand);
    if (!tab) return { error: { code: "tab_closed", message: `No live tab found: ${target}` } };
    await activatePage(tab);
    return { text: `Selected ${tab.agentId}` };
  }
  if (subcommand === "close") {
    const tab = target ? findTab(target) : await targetTab();
    if (!tab) return { error: { code: "tab_closed", message: `No live tab found: ${target}` } };
    await browser.tabs.remove(tab.tabId);
    tab.closed = true;
    return { text: `Closed ${tab.agentId}` };
  }
  if (subcommand === "label") {
    const tab = findTab(target);
    if (!tab || !value) return { error: { code: "invalid_args", message: "tabs label requires <tN> <label>" } };
    setLabel(tab, value);
    return { text: `Labeled ${tab.agentId} as ${value}` };
  }
  return { error: { code: "unsupported_command", message: `Unsupported tabs command: ${subcommand}` } };
}

function statusResult() {
  return {
    text: `pire-browser extension connected (${tabsByAgentId.size} tracked tab(s))`,
    profileId,
    tabs: Array.from(tabsByAgentId.values()),
  };
}

async function snapshotTab(tabId: number): Promise<FrameSnapshot[]> {
  const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => [{ frameId: 0 }]);
  const out: FrameSnapshot[] = [];
  for (const frame of frames) {
    try {
      const snapshot = await sendFrame(tabId, frame.frameId, { type: "snapshot" });
      out.push({ ...snapshot, frameId: frame.frameId });
    } catch (error) {
      out.push({
        frameId: frame.frameId,
        url: frame.url,
        opaque: true,
        elements: [],
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return out;
}

async function findInTab(tabId: number, locator: Locator): Promise<FrameSnapshot[]> {
  const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => [{ frameId: 0 }]);
  const out: FrameSnapshot[] = [];
  for (const frame of frames) {
    try {
      const response = await sendFrame(tabId, frame.frameId, { type: "find", locator });
      out.push({ frameId: frame.frameId, elements: response.matches ?? [], dialogs: response.dialogs ?? [] });
    } catch {
      out.push({ frameId: frame.frameId, opaque: true, elements: [] });
    }
  }
  return out;
}

async function sendFrame(tabId: number, frameId: number | undefined, message: Record<string, unknown>) {
  const options = typeof frameId === "number" ? { frameId } : undefined;
  return browser.tabs.sendMessage(tabId, message, options);
}

function parseFind(args: string[]):
  | { locator: Locator; action?: string; text?: string }
  | { error: Record<string, string> } {
  const [kind, ...rest] = args;
  let locator: Locator | undefined;
  const index = Number(valueAfter(rest, "--index") ?? "0");
  if (kind === "role") {
    const role = rest[0];
    if (!role) return { error: { code: "invalid_args", message: "find role requires <role>" } };
    locator = { kind: "role", role, name: valueAfter(rest, "--name"), index };
    const tail = actionTail(rest.slice(1), ["--name", "--index"], ["--exact"]);
    if (tail[0]) return { locator, action: tail[0], text: tail.slice(1).join(" ") };
  } else if (kind === "label" || kind === "text" || kind === "placeholder" || kind === "alt" || kind === "title") {
    const text = rest[0];
    if (!text) return { error: { code: "invalid_args", message: `find ${kind} requires <text>` } };
    locator = { kind, text, index } as Locator;
    const tail = actionTail(rest.slice(1), ["--index"], ["--exact"]);
    if (tail[0]) return { locator, action: tail[0], text: tail.slice(1).join(" ") };
  } else if (kind === "testid") {
    const value = rest[0];
    if (!value) return { error: { code: "invalid_args", message: "find testid requires <value>" } };
    locator = { kind: "testid", value, index };
    const tail = actionTail(rest.slice(1), ["--index"], ["--exact"]);
    if (tail[0]) return { locator, action: tail[0], text: tail.slice(1).join(" ") };
  } else if (kind === "first" || kind === "last" || kind === "nth") {
    const nthIndex = kind === "nth" ? Number(rest[0] ?? "0") : 0;
    const selector = kind === "nth" ? rest[1] : rest[0];
    if (!selector) return { error: { code: "invalid_args", message: `find ${kind} requires <selector>` } };
    locator = selectorToLocator(selector);
    if ("index" in locator) {
      locator.index = kind === "last" ? Number.MAX_SAFE_INTEGER : nthIndex;
    }
    const tail = actionTail(rest.slice(kind === "nth" ? 2 : 1), [], ["--exact"]);
    if (tail[0]) return { locator, action: tail[0], text: tail.slice(1).join(" ") };
  } else {
    return { error: { code: "invalid_args", message: "find requires role|label|text|placeholder|testid|alt|title|first|last|nth" } };
  }

  return { locator };
}

function locatorFromTarget(target?: string): { locator: Locator; frameId?: number } | { error: Record<string, string> } {
  if (!target) return { error: { code: "invalid_args", message: "target is required" } };
  if (target.startsWith("@")) {
    const ref = refs.get(target);
    if (!ref) return { error: { code: "ref_stale", message: `${target} is not available; run snapshot or find again` } };
    return { locator: ref.locator, frameId: ref.frameId };
  }
  return { locator: selectorToLocator(target) };
}

function selectorToLocator(target: string): Locator {
  if (target.startsWith("text=")) return { kind: "text", text: target.slice("text=".length), index: 0 };
  if (target.startsWith("xpath=")) return { kind: "xpath", expression: target.slice("xpath=".length), index: -1 };
  return { kind: "css", selector: target, index: -1 };
}

function normalizeContentResponse(response: any) {
  if (response?.error) return { error: response.error, dialogs: response.dialogs ?? [] };
  return {
    text: response?.text ?? "ok",
    value: response?.value,
    warnings: response?.warnings ?? [],
    dialogs: response?.dialogs ?? [],
  };
}

async function waitForUrl(pattern: string, timeout: number) {
  const tab = await targetTab();
  const matches = (url?: string) => Boolean(url && globToRegExp(pattern).test(url));
  if (matches(tab.url)) return { text: `URL matched ${pattern}` };
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error(`Timed out waiting for URL: ${pattern}`));
    }, timeout);
    const listener = (tabId: number, changeInfo: any, updatedTab: any) => {
      if (tabId === tab.tabId && matches(changeInfo.url ?? updatedTab.url)) {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
  return { text: `URL matched ${pattern}` };
}

function notAvailable(feature: string, message: string) {
  return {
    error: {
      code: "NotAvailableError",
      message,
      data: { feature, compatibility: "not_available" },
    },
  };
}

function bestEffortResult(text: string, feature: string, message: string) {
  return {
    text,
    warnings: [bestEffortWarning(feature, message)],
  };
}

function bestEffortWarning(feature: string, message: string) {
  return { code: "BEST_EFFORT_FIREFOX_GAP", feature, message };
}

function mergeWarnings(...groups: unknown[]) {
  return groups.flatMap((group) => (Array.isArray(group) ? group : group ? [group] : []));
}

async function prepareLargeResult(result: Record<string, unknown>) {
  const encoded = new TextEncoder().encode(JSON.stringify(result));
  if (encoded.byteLength < CHUNK_SIZE) return result;
  const base64 = bytesToBase64(encoded);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const transferId = crypto.randomUUID();
  const total = Math.ceil(base64.length / CHUNK_SIZE);
  for (let index = 0; index < total; index++) {
    postNative({
      type: "result_chunk",
      transfer_id: transferId,
      index,
      total,
      byte_length: encoded.byteLength,
      sha256,
      data: base64.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
    });
    await delay(5);
  }
  return {
    text: result.text ?? "Large result transferred",
    largeResult: {
      transferId,
      mimeType: "application/json",
      byteLength: encoded.byteLength,
      sha256,
    },
  };
}

async function activeTab(): Promise<any | undefined> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function targetTab(): Promise<TabRecord> {
  await reconcileTabs();
  const active = await activeTab();
  if (active?.id) return rememberTab(active);
  const first = Array.from(tabsByAgentId.values()).find((tab) => !tab.closed);
  if (first) return first;
  throw new Error("tab_closed: no active tab available");
}

function rememberTab(tab: any): TabRecord {
  if (typeof tab.id !== "number" || typeof tab.windowId !== "number") {
    throw new Error("tab_missing_id: Firefox tab is missing tabId or windowId");
  }
  let record = tabsByBrowserId.get(tab.id);
  if (!record) {
    record = {
      tabId: tab.id,
      windowId: tab.windowId,
      agentId: `t${nextTabNumber++}`,
      label: labels.get(String(tab.id)),
    };
    tabsByBrowserId.set(tab.id, record);
    tabsByAgentId.set(record.agentId, record);
  }
  record.url = tab.url;
  record.title = tab.title;
  record.active = tab.active;
  record.windowId = tab.windowId;
  record.closed = false;
  return record;
}

async function activatePage(page: PageRecord) {
  await browser.windows.update(page.windowId, { focused: true });
  await browser.tabs.update(page.tabId, { active: true });
}

function findTab(target?: string): TabRecord | undefined {
  if (!target) return undefined;
  const normalized = /^\d+$/.test(target) ? `t${target}` : target;
  return tabsByAgentId.get(normalized) || Array.from(tabsByAgentId.values()).find((tab) => tab.label === target);
}

function setLabel(tab: TabRecord, label: string) {
  tab.label = label;
  labels.set(String(tab.tabId), label);
}

async function reconcileTabs() {
  const liveTabs = await browser.tabs.query({});
  const liveIds = new Set<number>();
  for (const tab of liveTabs) {
    if (tab.id) {
      liveIds.add(tab.id);
      rememberTab(tab);
    }
  }
  for (const tab of tabsByAgentId.values()) {
    if (!liveIds.has(tab.tabId)) tab.closed = true;
  }
}

function registerBrowserListeners() {
  browser.tabs.onCreated.addListener((tab: any) => {
    if (typeof tab.id === "number" && typeof tab.windowId === "number") rememberTab(tab);
    postEvent("tabs_changed", {});
  });
  browser.tabs.onRemoved.addListener((tabId: number) => {
    const record = tabsByBrowserId.get(tabId);
    if (record) record.closed = true;
    postEvent("tabs_changed", {});
  });
  browser.tabs.onUpdated.addListener((_tabId: number, _change: any, tab: any) => {
    if (typeof tab.id === "number" && typeof tab.windowId === "number") rememberTab(tab);
    postEvent("tabs_changed", {});
  });
  browser.tabs.onActivated.addListener(() => postEvent("focused", {}));
  browser.windows.onFocusChanged.addListener(() => postEvent("focused", {}));
}

async function waitForTabComplete(tabId: number, timeout: number) {
  const tab = await browser.tabs.get(tabId);
  if (tab.status === "complete") return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("timeout waiting for page load"));
    }, timeout);
    const listener = (updatedTabId: number, changeInfo: any) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function waitForTabReady(tabId: number, expectedUrl: string, previousUrl: string | undefined, timeout: number) {
  const isReady = (tab: any) => {
    if (tab.status !== "complete" || !tab.url || tab.url === "about:blank" || tab.url === "about:newtab") return false;
    if (tab.url === expectedUrl || tab.url.startsWith(`${expectedUrl}#`)) return true;
    return previousUrl ? tab.url !== previousUrl : true;
  };
  const tab = await browser.tabs.get(tabId);
  if (isReady(tab)) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      browser.tabs.onUpdated.removeListener(listener);
      reject(new Error("timeout waiting for page load"));
    }, timeout);
    const listener = (updatedTabId: number, _changeInfo: any, updatedTab: any) => {
      if (updatedTabId === tabId && isReady(updatedTab)) {
        clearTimeout(timer);
        browser.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    browser.tabs.onUpdated.addListener(listener);
  });
}

async function sendScreenshotChunks(dataUrl: string) {
  const [header, base64] = dataUrl.split(",", 2);
  const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? "image/png";
  const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const transferId = crypto.randomUUID();
  const total = Math.ceil(base64.length / CHUNK_SIZE);
  for (let index = 0; index < total; index++) {
    const chunk = base64.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE);
    postNative({
      type: "screenshot_chunk",
      transfer_id: transferId,
      index,
      total,
      byte_length: bytes.length,
      sha256,
      data: chunk,
    });
    await delay(5);
  }
  return { transferId, mimeType, byteLength: bytes.length, sha256 };
}

function summarizeElement(element: ElementSnapshot): string {
  const name = element.name || element.label || element.placeholder || element.text;
  const disabled = element.disabled ? " disabled" : "";
  return `${element.role}${name ? ` "${truncate(name, 80)}"` : ""}${disabled}`;
}

function withDialogs(result: Record<string, unknown>, frames: FrameSnapshot[]) {
  const dialogs = frames.flatMap((frame) => frame.dialogs ?? []);
  if (dialogs.length) {
    result.dialogs = dialogs;
    result.warnings = dialogs.map((dialog) => `${dialog.type}: ${dialog.message}`);
  }
  return result;
}

function valueAfter(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
}

function firstPositionalArg(args: string[], valueFlags: string[]) {
  let skipNext = false;
  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (valueFlags.includes(arg)) {
      skipNext = true;
      continue;
    }
    if (arg.startsWith("--")) continue;
    return arg;
  }
  return undefined;
}

function parsePlainWaitMs(args: string[]) {
  const positional = firstPositionalArg(args, ["--selector", "--timeout"]);
  if (positional !== undefined) return parsePositiveInteger(positional, "wait");
  return parseTimeoutOption(args, 1000);
}

function parseTimeoutOption(args: string[], defaultMs: number) {
  const index = args.indexOf("--timeout");
  if (index < 0) return { ms: defaultMs };
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    return { error: { code: "invalid_args", message: "--timeout requires a positive integer" } };
  }
  return parsePositiveInteger(value, "--timeout");
}

function parsePositiveInteger(value: string, label: string) {
  const ms = Number(value);
  if (!Number.isInteger(ms) || ms <= 0) {
    return { error: { code: "invalid_args", message: `${label} requires a positive integer` } };
  }
  return { ms };
}

function openTabText(tab: TabRecord) {
  const suffix = tab.title || tab.url || "";
  return `Browser open in ${tab.agentId}${suffix ? ` ${suffix}` : ""}`;
}

function actionTail(args: string[], valueFlags: string[], boolFlags: string[]) {
  const tail: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (valueFlags.includes(arg)) {
      index += 1;
      continue;
    }
    if (boolFlags.includes(arg)) continue;
    tail.push(arg);
  }
  return tail;
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function splitCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaping = false;
  for (const char of command) {
    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = undefined;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current) parts.push(current);
  return parts;
}

function globToRegExp(pattern: string) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`);
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function cookieUrl(cookie: any) {
  const protocol = cookie.secure ? "https://" : "http://";
  return `${protocol}${String(cookie.domain).replace(/^\./, "")}${cookie.path ?? "/"}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
}
