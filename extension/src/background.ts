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

type Locator =
  | { kind: "role"; role: string; name?: string; index: number }
  | { kind: "label"; text: string; index: number }
  | { kind: "text"; text: string; index: number }
  | { kind: "placeholder"; text: string; index: number }
  | { kind: "testid"; value: string; index: number };

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

type TabRecord = {
  tabId: number;
  agentId: string;
  label?: string;
  url?: string;
  title?: string;
  active?: boolean;
  windowId?: number;
  closed?: boolean;
};

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
    const result = await executeCommand(args);
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
      return openCommand(rest);
    case "snapshot":
      return snapshotCommand(rest);
    case "find":
      return findCommand(rest);
    case "click":
      return clickCommand(rest);
    case "fill":
      return fillCommand(rest);
    case "press":
      return pressCommand(rest);
    case "scroll":
      return scrollCommand(rest);
    case "wait":
      return waitCommand(rest);
    case "screenshot":
      return screenshotCommand(rest);
    case "tabs":
      return tabsCommand(rest);
    case "close":
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

async function openCommand(args: string[]) {
  const url = args.find((arg) => !arg.startsWith("--"));
  if (!url) return { error: { code: "invalid_args", message: "open requires <url>" } };
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
  if (parsed.action === "click") return actOnFind(parsed.locator, "click");
  if (parsed.action === "fill") return actOnFind(parsed.locator, "fill", parsed.text ?? "");

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

async function actOnFind(locator: Locator, action: "click" | "fill", text = "") {
  const tab = await targetTab();
  const frames = await findInTab(tab.tabId, locator);
  const matches = frames.flatMap((frame) => frame.elements.map(() => frame.frameId));
  if (matches.length === 0) return { error: { code: "not_found", message: "No element matched locator" } };
  if (matches.length > 1) return { error: { code: "ambiguous_locator", message: `${matches.length} elements matched locator` } };
  return action === "click" ? clickLocator(locator, matches[0]) : fillLocator(locator, text, matches[0]);
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

async function scrollCommand(args: string[]) {
  const direction = args[0] ?? "down";
  const pixels = Number(args[1] ?? "900");
  if (!["up", "down"].includes(direction) || !Number.isFinite(pixels) || pixels <= 0) {
    return { error: { code: "invalid_args", message: "scroll requires up|down [positive_pixels]" } };
  }
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, undefined, { type: "scroll", direction, pixels });
  return normalizeContentResponse(response);
}

async function waitCommand(args: string[]) {
  const timeout = Number(valueAfter(args, "--timeout") ?? "10000");
  const selector = valueAfter(args, "--selector");
  if (args.includes("--load")) {
    await waitForTabComplete((await targetTab()).tabId, timeout);
    return { text: "Page load complete" };
  }
  if (selector) {
    const tab = await targetTab();
    const response = await sendFrame(tab.tabId, undefined, { type: "wait_selector", selector, timeout });
    return normalizeContentResponse(response);
  }
  await delay(Math.min(timeout, 1000));
  return { text: "Wait complete" };
}

async function screenshotCommand(args: string[]) {
  const path = args[0];
  if (!path) return { error: { code: "invalid_args", message: "screenshot requires <path>" } };
  const tab = await targetTab();
  await browser.tabs.update(tab.tabId, { active: true });
  await browser.windows.update(tab.windowId, { focused: true });
  const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  const meta = await sendScreenshotChunks(dataUrl);
  return {
    text: `Screenshot captured for ${path}`,
    screenshot: meta,
    screenshotPath: path,
  };
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
  if (subcommand === "select") {
    const tab = findTab(target);
    if (!tab) return { error: { code: "tab_closed", message: `No live tab found: ${target}` } };
    await browser.tabs.update(tab.tabId, { active: true });
    await browser.windows.update(tab.windowId, { focused: true });
    return { text: `Selected ${tab.agentId}` };
  }
  if (subcommand === "close") {
    const tab = findTab(target);
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
  | { locator: Locator; action?: "click" | "fill"; text?: string }
  | { error: Record<string, string> } {
  const [kind, ...rest] = args;
  let locator: Locator | undefined;
  let consumed = 0;
  const index = Number(valueAfter(rest, "--index") ?? "0");
  if (kind === "role") {
    const role = rest[0];
    if (!role) return { error: { code: "invalid_args", message: "find role requires <role>" } };
    locator = { kind: "role", role, name: valueAfter(rest, "--name"), index };
    consumed = 1 + optionFootprint(rest, ["--name", "--index"]);
  } else if (kind === "label" || kind === "text" || kind === "placeholder") {
    const text = rest[0];
    if (!text) return { error: { code: "invalid_args", message: `find ${kind} requires <text>` } };
    locator = { kind, text, index } as Locator;
    consumed = 1 + optionFootprint(rest, ["--index"]);
  } else if (kind === "testid") {
    const value = rest[0];
    if (!value) return { error: { code: "invalid_args", message: "find testid requires <value>" } };
    locator = { kind: "testid", value, index };
    consumed = 1 + optionFootprint(rest, ["--index"]);
  } else {
    return { error: { code: "invalid_args", message: "find requires role|label|text|placeholder|testid" } };
  }

  const tail = rest.filter((part, i) => i >= consumed);
  if (tail[0] === "click") return { locator, action: "click" };
  if (tail[0] === "fill") return { locator, action: "fill", text: tail.slice(1).join(" ") };
  return { locator };
}

function locatorFromTarget(target?: string): { locator: Locator; frameId?: number } | { error: Record<string, string> } {
  if (!target) return { error: { code: "invalid_args", message: "target is required" } };
  if (target.startsWith("@")) {
    const ref = refs.get(target);
    if (!ref) return { error: { code: "ref_stale", message: `${target} is not available; run snapshot or find again` } };
    return { locator: ref.locator, frameId: ref.frameId };
  }
  return { error: { code: "invalid_args", message: "target must be a ref like @e1 or use find <locator> <action>" } };
}

function normalizeContentResponse(response: any) {
  if (response?.error) return { error: response.error, dialogs: response.dialogs ?? [] };
  return {
    text: response?.text ?? "ok",
    dialogs: response?.dialogs ?? [],
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
  let record = tabsByBrowserId.get(tab.id);
  if (!record) {
    record = {
      tabId: tab.id,
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

function findTab(target?: string): TabRecord | undefined {
  if (!target) return undefined;
  return tabsByAgentId.get(target) || Array.from(tabsByAgentId.values()).find((tab) => tab.label === target);
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
    rememberTab(tab);
    postEvent("tabs_changed", {});
  });
  browser.tabs.onRemoved.addListener((tabId: number) => {
    const record = tabsByBrowserId.get(tabId);
    if (record) record.closed = true;
    postEvent("tabs_changed", {});
  });
  browser.tabs.onUpdated.addListener((_tabId: number, _change: any, tab: any) => {
    rememberTab(tab);
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

function optionFootprint(args: string[], flags: string[]) {
  let count = 0;
  for (const flag of flags) {
    const index = args.indexOf(flag);
    if (index >= 0 && args[index + 1] !== undefined) count += 2;
  }
  return count;
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
}
