{
type RpcRequest = {
  type: "request";
  id: string;
  method: string;
  params?: Record<string, any>;
};

type DomainPolicyContext = {
  enabled?: boolean;
  patterns?: string[];
};

type ActionPolicyContext = {
  enabled?: boolean;
  default?: "allow" | "deny";
  allow?: string[];
  deny?: string[];
};

type ConfirmationPolicyContext = {
  enabled?: boolean;
  categories?: string[];
  approvedConfirmationId?: string;
};

type UploadFilePayload = {
  name: string;
  mimeType?: string;
  size: number;
  sha256?: string;
  bytesBase64: string;
};

type UploadFilesRef = {
  transferId: string;
  files: {
    name: string;
    mimeType?: string;
    size: number;
    sha256?: string;
    chunks: number;
  }[];
};

type UploadChunkResponse = {
  type: "upload_chunk_response";
  request_id: string;
  ok: boolean;
  transfer_id: string;
  file_index: number;
  chunk_index: number;
  total: number;
  data: string;
  error?: {
    code: string;
    message: string;
  };
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

type InitScriptPayload = {
  path: string;
  code: string;
};

type RuntimeInitScriptRecord = {
  id: string;
  registration: any;
  code: string;
};

type AuthSelectors = {
  username: string;
  password: string;
  submit: string;
};

type AuthProfile = {
  schemaVersion: 1;
  name: string;
  url: string;
  username: string;
  password: string;
  selectors: AuthSelectors;
  createdAt: string | number;
  updatedAt: string | number;
};

type NativeEvent = {
  type: "event";
  name: string;
  data?: Record<string, unknown>;
};

type NonHandleLocator =
  | { kind: "role"; role: string; name?: string; index: number; exact?: boolean }
  | { kind: "label"; text: string; index: number; exact?: boolean }
  | { kind: "text"; text: string; index: number; exact?: boolean }
  | { kind: "placeholder"; text: string; index: number; exact?: boolean }
  | { kind: "testid"; value: string; index: number }
  | { kind: "css"; selector: string; index: number }
  | { kind: "xpath"; expression: string; index: number }
  | { kind: "alt"; text: string; index: number; exact?: boolean }
  | { kind: "title"; text: string; index: number; exact?: boolean };

type Locator = NonHandleLocator | { kind: "handle"; handle: string; fallback: NonHandleLocator };

type ElementSnapshot = {
  ref?: string;
  role: string;
  name: string;
  text: string;
  label: string;
  placeholder: string;
  testid: string;
  href?: string;
  frameUrl?: string;
  depth?: number;
  disabled: boolean;
  visible: boolean;
  cursorInteractive?: boolean;
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

type ScreenshotAnnotation = {
  label?: string;
  ref?: string;
  role?: string;
  name?: string;
  locator?: Locator;
  bounds?: { x: number; y: number; width: number; height: number };
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
  controlled?: boolean;
};

type TabRecord = PageRecord;
type ControlledClosePlan = { windowIds: number[]; tabIds: number[] };
type ActivePageSummary = {
  agentId: string;
  label?: string;
  title?: string;
  url?: string;
  tabId: number;
  windowId: number;
  updatedAt: number;
};

type ClipboardFrameResult = {
  handled?: boolean;
  focused?: boolean;
  pasted?: boolean;
  text?: string;
  length?: number;
  reason?: string;
  dialogs?: DialogRecord[];
};

type WarningObject = {
  code: string;
  feature: string;
  message: string;
  [key: string]: unknown;
};

type ActiveOriginStatePayload = {
  schemaVersion: number;
  tool: string;
  kind: string;
  createdAt?: number;
  source: {
    url: string;
    origin: string;
    sessionId?: string;
    profileName?: string;
  };
  cookies?: any[];
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
};

type HeaderRule = {
  name: string;
  value: string;
};

type NetworkHeaderRecord = {
  name: string;
  value: string;
  redacted?: boolean;
};

type NetworkBodyField = {
  name: string;
  value: string;
  redacted?: boolean;
  truncated?: boolean;
};

type NetworkBodyRecord = {
  kind: "formData" | "raw" | "text" | "binary" | "error";
  text?: string;
  fields?: NetworkBodyField[];
  size?: number;
  truncated?: boolean;
  redacted?: boolean;
  encoding?: string;
  mimeType?: string;
  error?: string;
};

type BasicCredentialRule = {
  username: string;
  password: string;
};

type ProxyState = {
  enabled: boolean;
  url?: string;
  scheme?: string;
  host?: string;
  port?: string;
  bypass?: string;
  hasCredentials?: boolean;
  source?: string;
};

type GeolocationState = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type NetworkActivityRecord = {
  requestId: string;
  tabId: number;
  url?: string;
  type?: string;
  method?: string;
  statusCode?: number;
  statusLine?: string;
  fromCache?: boolean;
  requestHeaders?: NetworkHeaderRecord[];
  responseHeaders?: NetworkHeaderRecord[];
  requestBody?: NetworkBodyRecord;
  responseBody?: NetworkBodyRecord;
  error?: string;
  frameId?: number;
  parentFrameId?: number;
  documentUrl?: string;
  initiator?: string;
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  active?: boolean;
  routeId?: string;
  routeAction?: "continue" | "abort" | "mock";
};

type NetworkRouteRule = {
  id: string;
  tabId: number;
  pattern: string;
  abort: boolean;
  body?: string;
  contentType?: string;
  resourceTypes?: string[];
  createdAt: number;
};

type TraceRecording = {
  startedAt: number;
  tabId: number;
  agentId: string;
  url?: string;
  title?: string;
};

type ProfilerRecording = {
  startedAt: number;
  tabId: number;
  agentId: string;
  url?: string;
  title?: string;
  categories?: string;
};

type VisualRecordingFrame = {
  index: number;
  capturedAt: number;
  elapsedMs: number;
  tabId: number;
  windowId?: number;
  url?: string;
  title?: string;
  dataUrl?: string;
  error?: {
    code: string;
    message: string;
  };
};

type VisualRecording = {
  startedAt: number;
  tabId: number;
  agentId: string;
  url?: string;
  title?: string;
  outputDir?: string;
  intervalMs: number;
  maxFrames: number;
  active: boolean;
  timer?: number;
  capturing?: boolean;
  stoppedReason?: string;
  frames: VisualRecordingFrame[];
};

type CommandErrorResult = { error: { code: string; message: string } };
type RecordStartArgs = { intervalMs: number; maxFrames: number; outputDir?: string; url?: string };
type RecordStopArgs = { outputDir?: string };
type RecordValueResult = { value: number };

const HOST_NAME = "dev.pi.pire_browser";
const CHUNK_SIZE = 700_000;
const UPLOAD_CHUNK_TIMEOUT_MS = 10_000;
const CLOSE_TEARDOWN_DELAY_MS = 0;
const TAB_READY_POLL_INTERVAL_MS = 100;
const NETWORK_IDLE_QUIET_MS = 500;
const NETWORK_IDLE_POLL_INTERVAL_MS = 50;
const MAX_NETWORK_RECORDS_PER_TAB = 300;
const MAX_NETWORK_BODY_TEXT_LENGTH = 4000;
const MAX_NETWORK_BODY_FIELD_VALUE_LENGTH = 1000;
const MAX_NETWORK_BODY_FIELDS = 50;
const MAX_NETWORK_RESPONSE_BODY_TEXT_LENGTH = 12000;
const DOWNLOAD_TIMEOUT_MS = 60_000;
const DOWNLOAD_RECENT_MS = 60_000;
const DOWNLOAD_POLL_INTERVAL_MS = 200;
const AUTH_STORAGE_KEY = "pireBrowserAuthProfiles";
const DEFAULT_AUTH_SELECTORS: AuthSelectors = {
  username:
    'input[autocomplete="username"], input[type="email"], input[name="username"], input[name="email"], #username, #email, input[type="text"]',
  password: 'input[autocomplete="current-password"], input[type="password"], input[name="password"], #password',
  submit: 'button[type="submit"], input[type="submit"], button',
};

let port: any;
let profileId = "";
let nextTabNumber = 1;
let controlledCloseScheduled = false;
let nativeReconnectEnabled = true;
let autoDialogEnabled = true;
const tabsByBrowserId = new Map<number, TabRecord>();
const tabsByAgentId = new Map<string, TabRecord>();
const labels = new Map<string, string>();
const refs = new Map<string, { tabId: number; frameId: number; locator: Locator; summary: string }>();
const selectedFramesByTabId = new Map<number, { frameId: number; parentFrameId: number; url?: string; summary: string }>();
const recentDialogsByTabId = new Map<number, DialogRecord[]>();
const lastSnapshotTextByTabId = new Map<number, string>();
const runtimeInitScripts = new Map<string, RuntimeInitScriptRecord>();
let geolocationInitScriptRegistration: any | null = null;
const headersByOrigin = new Map<string, HeaderRule[]>();
const credentialsByOrigin = new Map<string, BasicCredentialRule>();
let proxyCredentials: BasicCredentialRule | null = null;
const networkRequestsById = new Map<string, NetworkActivityRecord>();
const networkRequestIdsByTabId = new Map<number, Set<string>>();
const networkRequestLogIdsByTabId = new Map<number, string[]>();
const lastNetworkActivityAtByTabId = new Map<number, number>();
const networkHarRecordingStartedAtByTabId = new Map<number, number>();
const traceRecordingsByTabId = new Map<number, TraceRecording>();
const profilerRecordingsByTabId = new Map<number, ProfilerRecording>();
const visualRecordingsByTabId = new Map<number, VisualRecording>();
const networkRoutes = new Map<string, NetworkRouteRule>();
const networkRouteMatchesByRequestId = new Map<string, { routeId: string; action: "continue" | "abort" | "mock" }>();
const pendingUploadChunks = new Map<string, { resolve: (message: UploadChunkResponse) => void; reject: (error: Error) => void; timer: number }>();
let offlineModeEnabled = false;
let nextRuntimeInitScriptNumber = 1;
let nextNetworkRouteNumber = 1;
type ContentColorScheme = "light" | "dark" | "auto";
type DeviceProfile = {
  name: string;
  aliases: string[];
  width: number;
  height: number;
  scale: number;
  userAgent: string;
  isMobile: boolean;
  hasTouch: boolean;
};

const DEVICE_PROFILES: DeviceProfile[] = [
  {
    name: "iPhone 14",
    aliases: ["iphone 14", "iphone14"],
    width: 390,
    height: 844,
    scale: 3,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "iPhone 15 Pro",
    aliases: ["iphone 15 pro", "iphone15pro"],
    width: 393,
    height: 852,
    scale: 3,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "Pixel 7",
    aliases: ["pixel 7", "pixel7", "google pixel 7"],
    width: 412,
    height: 915,
    scale: 2.625,
    userAgent:
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Mobile Safari/537.36",
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "Galaxy S22",
    aliases: ["galaxy s22", "samsung galaxy s22", "galaxys22"],
    width: 360,
    height: 780,
    scale: 3,
    userAgent:
      "Mozilla/5.0 (Linux; Android 12; SAMSUNG SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/16.0 Chrome/96.0.4664.45 Mobile Safari/537.36",
    isMobile: true,
    hasTouch: true,
  },
  {
    name: "iPad",
    aliases: ["ipad"],
    width: 768,
    height: 1024,
    scale: 2,
    userAgent:
      "Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    isMobile: true,
    hasTouch: true,
  },
];

connectNative();
void applyContentColorScheme("auto").catch(() => undefined);
registerRuntimeMessageListener();
registerBrowserListeners();
registerHeaderListener();
registerAuthListener();
registerNetworkRouteListener();
registerNetworkActivityListeners();

function connectNative() {
  if (!nativeReconnectEnabled) return;
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
    if (!nativeReconnectEnabled) return;
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
    void postSessionEvent("focused", {});
    setInterval(() => void postSessionEvent("heartbeat", {}), 5000);
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

async function postSessionEvent(name: string, data: Record<string, unknown>) {
  postEvent(name, { ...data, activePage: await activePageSummary() });
}

async function activePageSummary(): Promise<ActivePageSummary | null> {
  const active = await activeTab().catch(() => undefined);
  if (typeof active?.id !== "number" || typeof active.windowId !== "number") return null;
  const record = rememberTab(active);
  return {
    agentId: record.agentId,
    label: record.label,
    title: record.title,
    url: record.url,
    tabId: record.tabId,
    windowId: record.windowId,
    updatedAt: Date.now(),
  };
}

async function handleNativeMessage(message: any) {
  if (message.type === "request") {
    const request = message as RpcRequest;
    const response = await executeRequest(request);
    postNative(response);
  } else if (message.type === "upload_chunk_response") {
    handleUploadChunkResponse(message as UploadChunkResponse);
  }
}

function handleUploadChunkResponse(message: UploadChunkResponse) {
  const pending = pendingUploadChunks.get(message.request_id);
  if (!pending) return;
  pendingUploadChunks.delete(message.request_id);
  clearTimeout(pending.timer);
  if (message.ok) {
    pending.resolve(message);
  } else {
    pending.reject(new Error(message.error?.message || message.error?.code || "upload chunk request failed"));
  }
}

async function executeRequest(request: RpcRequest): Promise<RpcResponse> {
  try {
    if (request.method !== "command") {
      return errorResponse(request.id, "unsupported_method", `Unsupported method: ${request.method}`);
    }
    await applyRuntimeSettingsFromParams(request.params ?? {});
    const args = Array.isArray(request.params?.args) ? (request.params?.args as string[]) : [];
    const domainPolicy = domainPolicyFromParams(request.params?.domainPolicy);
    const actionPolicy = actionPolicyFromParams(request.params?.actionPolicy);
    const confirmationPolicy = confirmationPolicyFromParams(request.params?.confirmationPolicy);
    const result = await executeCommandWithPolicies(args, domainPolicy, actionPolicy, confirmationPolicy, request.params ?? {});
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

function registerRuntimeMessageListener() {
  browser.runtime.onMessage.addListener((message: any) => {
    if (!message || typeof message.type !== "string") return undefined;
    if (message.type === "runtime_settings") {
      return Promise.resolve({ autoDialog: autoDialogEnabled });
    }
    return undefined;
  });
}

async function applyRuntimeSettingsFromParams(params: Record<string, any>) {
  if (params.autoDialog === false) {
    await setAutoDialogEnabled(false);
  } else if (params.autoDialog === true) {
    await setAutoDialogEnabled(true);
  }
}

async function setAutoDialogEnabled(enabled: boolean) {
  if (autoDialogEnabled === enabled) return;
  autoDialogEnabled = enabled;
  await broadcastDialogAutoHandling(enabled);
}

async function broadcastDialogAutoHandling(enabled: boolean) {
  let tabs: any[] = [];
  try {
    tabs = await browser.tabs.query({});
  } catch {
    return;
  }
  await Promise.all(
    tabs
      .filter((tab) => typeof tab.id === "number")
      .map((tab) =>
        browser.tabs
          .sendMessage(tab.id, { type: "dialog_auto", enabled })
          .catch(() => undefined)
      )
  );
}

function errorResponse(id: string, code: string, message: string): RpcResponse {
  return { type: "response", id, ok: false, error: { code, message } };
}

async function executeCommandWithPolicies(
  args: string[],
  domainPolicy: DomainPolicyContext | null,
  actionPolicy: ActionPolicyContext | null,
  confirmationPolicy: ConfirmationPolicyContext | null,
  params: Record<string, any> = {}
): Promise<Record<string, unknown>> {
  const domainError = await domainPolicyErrorForCommand(args, domainPolicy);
  if (domainError) return { error: domainError };
  const actionError = actionPolicyErrorForCommand(args, actionPolicy);
  if (actionError) return { error: actionError };
  const confirmationError = confirmationPolicyErrorForCommand(args, actionPolicy, confirmationPolicy);
  if (confirmationError) return { error: confirmationError };
  return prepareLargeResult(await executeCommand(args, domainPolicy, actionPolicy, confirmationPolicy, params));
}

function domainPolicyFromParams(value: unknown): DomainPolicyContext | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.enabled !== true) return null;
  const patterns = Array.isArray(candidate.patterns)
    ? candidate.patterns.filter((pattern): pattern is string => typeof pattern === "string")
    : [];
  if (patterns.length === 0) return null;
  return { enabled: true, patterns };
}

function actionPolicyFromParams(value: unknown): ActionPolicyContext | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.enabled !== true) return null;
  const defaultValue = candidate.default === "deny" ? "deny" : "allow";
  const allow = Array.isArray(candidate.allow)
    ? candidate.allow.filter((category): category is string => typeof category === "string")
    : [];
  const deny = Array.isArray(candidate.deny)
    ? candidate.deny.filter((category): category is string => typeof category === "string")
    : [];
  return { enabled: true, default: defaultValue, allow, deny };
}

function confirmationPolicyFromParams(value: unknown): ConfirmationPolicyContext | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  if (candidate.enabled !== true) return null;
  const categories = Array.isArray(candidate.categories)
    ? candidate.categories.filter((category): category is string => typeof category === "string")
    : [];
  if (categories.length === 0) return null;
  const approvedConfirmationId =
    typeof candidate.approvedConfirmationId === "string" ? candidate.approvedConfirmationId : undefined;
  return { enabled: true, categories, approvedConfirmationId };
}

async function domainPolicyErrorForCommand(args: string[], policy: DomainPolicyContext | null): Promise<RpcResponse["error"] | null> {
  if (!policy?.enabled || !policy.patterns?.length) return null;
  const [command] = args;
  const destinationUrl = domainPolicyDestinationUrl(args);
  if (destinationUrl) return domainPolicyErrorForUrl(destinationUrl, policy);
  if (!commandNeedsActivePageDomainCheck(args)) return null;
  const tab = await targetTab().catch(() => undefined);
  const url = tab?.url;
  if (!url) {
    return {
      code: "DomainPolicyError",
      data: { phase: "policy" },
      message: `domain allowlist requires an active http(s) page for ${command || "command"}`,
    };
  }
  return domainPolicyErrorForUrl(url, policy);
}

function actionPolicyErrorForCommand(args: string[], policy: ActionPolicyContext | null): RpcResponse["error"] | null {
  if (!policy?.enabled) return null;
  const verdict = actionPolicyVerdictForCommand(args, policy);
  if (verdict.decision !== "deny") return null;
  return {
    code: "ActionPolicyError",
    data: { phase: "policy" },
    message: `action category \`${verdict.category ?? "unknown"}\` is denied by the active action policy`,
  };
}

function confirmationPolicyErrorForCommand(
  args: string[],
  actionPolicy: ActionPolicyContext | null,
  policy: ConfirmationPolicyContext | null
): RpcResponse["error"] | null {
  if (!policy?.enabled || !policy.categories?.length || policy.approvedConfirmationId) return null;
  const verdict = actionPolicyVerdictForCommand(args, actionPolicy ?? { enabled: false });
  if (!verdict.category || !policy.categories.includes(verdict.category)) return null;
  return {
    code: "ConfirmationRequired",
    data: { phase: "policy", category: verdict.category },
    message: `action category \`${verdict.category}\` requires confirmation`,
  };
}

function actionPolicyVerdictForCommand(args: string[], policy: ActionPolicyContext): {
  category: string | null;
  decision: "allow" | "deny" | "meta" | "not_available" | "unsupported";
} {
  const resolution = actionPolicyCategoryForCommand(args);
  if (resolution.kind !== "category") {
    return { category: null, decision: resolution.kind };
  }
  const category = resolution.category;
  if (policy.deny?.includes(category)) return { category, decision: "deny" };
  if (policy.allow?.includes(category)) return { category, decision: "allow" };
  return { category, decision: policy.default === "deny" ? "deny" : "allow" };
}

function actionPolicyCategoryForCommand(args: string[]):
  | { kind: "category"; category: string }
  | { kind: "meta" | "not_available" | "unsupported" | "allow" } {
  const [command, subcommand] = args;
  if (!command) return { kind: "unsupported" };
  if (
    ["status", "doctor", "install-status", "help", "setup", "session", "sessions", "confirm", "deny", "close", "quit", "exit"].includes(command)
  ) {
    return { kind: "meta" };
  }
  if (command === "launch" && !args.includes("--url")) return { kind: "meta" };
  if (command === "state" && subcommand === "inspect") return { kind: "meta" };
  if ((command === "tab" || command === "tabs") && subcommand === "label") return { kind: "meta" };
  if (command === "batch") return { kind: "allow" };
  if (notAvailableActionPolicyRoot(command)) return { kind: "not_available" };

  const category = actionPolicyCategoryName(args);
  return category ? { kind: "category", category } : { kind: "unsupported" };
}

function actionPolicyCategoryName(args: string[]): string | null {
  const [command, subcommand] = args;
  switch (command) {
    case "open":
    case "goto":
    case "navigate":
      if (args.includes("--headers")) return "network";
      return "navigate";
    case "read":
      return "get";
    case "launch":
    case "back":
    case "forward":
    case "reload":
      return "navigate";
    case "tab":
    case "tabs":
      if (!subcommand || subcommand === "list") return "get";
      if (["new", "select", "close"].includes(subcommand)) return "navigate";
      return null;
    case "window":
      return subcommand === "new" ? "navigate" : null;
    case "click":
    case "dblclick":
    case "tap":
      return "click";
    case "fill":
    case "type":
    case "select":
    case "check":
    case "uncheck":
      return "fill";
    case "keyboard":
      return subcommand === "type" || subcommand === "inserttext" ? "fill" : null;
    case "eval":
    case "setcontent":
      return "eval";
    case "pushstate":
      return "navigate";
    case "console":
    case "errors":
      return args.includes("--clear") || subcommand === "clear" ? "state" : "get";
    case "highlight":
      return "snapshot";
    case "vitals":
      return firstPositionalArg(args.slice(1), []) ? "navigate" : "get";
    case "react":
      if (subcommand === "renders") return args[2] === "start" ? "state" : "get";
      return subcommand === "tree" || subcommand === "inspect" || subcommand === "suspense" ? "get" : null;
    case "network":
      if (subcommand === "requests") return args.includes("--clear") ? "state" : "get";
      if (subcommand === "request") return "get";
      if (subcommand === "wait-for-request" || subcommand === "wait-for-response") return "get";
      if (!subcommand) return "get";
      return "network";
    case "snapshot":
    case "screenshot":
    case "pdf":
      return "snapshot";
    case "diff":
      if (subcommand === "snapshot" || subcommand === "screenshot") return "snapshot";
      if (subcommand === "url") return "navigate";
      return null;
    case "trace":
      if (subcommand === "start") return "state";
      if (subcommand === "status") return "get";
      if (subcommand === "stop") return "snapshot";
      return null;
    case "profiler":
      if (subcommand === "start") return "state";
      if (subcommand === "status") return "get";
      if (subcommand === "stop") return "snapshot";
      return null;
    case "record":
      if (subcommand === "start") return "state";
      if (subcommand === "status" || !subcommand) return "get";
      if (subcommand === "stop" || subcommand === "restart") return "snapshot";
      return null;
    case "addinitscript":
    case "removeinitscript":
      return "eval";
    case "scroll":
    case "scrollintoview":
    case "scrollinto":
    case "swipe":
      return "scroll";
    case "mouse":
      return subcommand === "wheel" ? "scroll" : "interact";
    case "drag":
      return "interact";
    case "wait":
      return args.includes("--download") ? "download" : "wait";
    case "find":
      return findActionPolicyCategory(args);
    case "get":
    case "is":
    case "frame":
      return "get";
    case "cookies":
      return subcommand === "set" || subcommand === "clear" ? "state" : "get";
    case "storage":
      return (subcommand === "local" || subcommand === "session") && ["set", "clear"].includes(args[2] ?? "")
        ? "state"
        : "get";
    case "dialog":
      return subcommand === "accept" || subcommand === "dismiss" ? "interact" : "get";
    case "hover":
    case "focus":
    case "press":
    case "key":
    case "keydown":
    case "keyup":
      return "interact";
    case "clipboard":
      if (subcommand === "paste") return "fill";
      if (subcommand === "read") return "get";
      if (subcommand === "write" || subcommand === "copy") return "state";
      return null;
    case "auth":
      if (subcommand === "save" || subcommand === "delete") return "state";
      if (subcommand === "list" || subcommand === "show") return "get";
      if (subcommand === "login" || subcommand === "login-inline") return "fill";
      return null;
    case "state":
      if (subcommand === "save" || subcommand === "load") return "state";
      return null;
    case "set":
      if (subcommand === "headers" || subcommand === "offline" || subcommand === "credentials") return "network";
      return "state";
    case "device":
      return "state";
    case "download":
      return "download";
    case "upload":
      return "upload";
    default:
      return null;
  }
}

function findActionPolicyCategory(args: string[]) {
  const parsed = parseFind(args.slice(1));
  if ("error" in parsed || !parsed.action) return "get";
  const action = parsed.action;
  if (action === "click" || action === "dblclick") return "click";
  if (["fill", "type", "select", "check", "uncheck"].includes(action)) return "fill";
  if (["text", "html", "value", "attr", "box", "styles"].includes(action)) return "get";
  if (action === "scroll" || action === "scrollintoview" || action === "scrollinto") return "scroll";
  if (["press", "key", "hover", "focus"].includes(action)) return "interact";
  if (action === "eval") return "eval";
  return "interact";
}

function notAvailableActionPolicyRoot(command: string) {
  return [
    "connect",
    "dashboard",
    "install",
    "profiles",
    "stream",
    "upgrade",
  ].includes(command);
}

function domainPolicyDestinationUrl(args: string[]): string | undefined {
  const [command, subcommand, ...rest] = args;
  if (["open", "goto", "navigate"].includes(command ?? "")) {
    return firstPositionalArg(args.slice(1), ["--label", "--init-script", "--headers", "--enable"]);
  }
  if ((command === "tab" || command === "tabs") && subcommand === "new") {
    return firstPositionalArg(rest, ["--label"]);
  }
  if (command === "vitals") {
    return firstPositionalArg(rest, []);
  }
  return undefined;
}

function domainPolicyErrorForUrl(input: string, policy: DomainPolicyContext): RpcResponse["error"] | null {
  const parsed = parsePolicyUrl(input);
  if (!parsed.ok) {
    return { code: "DomainPolicyError", data: { phase: "policy" }, message: parsed.message };
  }
  if (parsed.scheme !== "http" && parsed.scheme !== "https") {
    return {
      code: "DomainPolicyError",
      data: { phase: "policy" },
      message: `${parsed.scheme}: URLs are not allowed when a domain allowlist is active`,
    };
  }
  if (policy.patterns?.some((pattern) => domainPatternMatches(pattern, parsed.host))) return null;
  return {
    code: "DomainPolicyError",
    data: { phase: "policy" },
    message: `host \`${parsed.host}\` is outside the active domain allowlist (${policy.patterns?.join(", ")})`,
  };
}

function parsePolicyUrl(input: string): { ok: true; scheme: string; host: string } | { ok: false; message: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, message: "empty URL cannot be checked against domain allowlist" };
  const explicitScheme = explicitNonHttpScheme(trimmed);
  if (explicitScheme) return { ok: true, scheme: explicitScheme, host: "" };
  const normalized = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(normalized);
    return { ok: true, scheme: url.protocol.replace(":", "").toLowerCase(), host: normalizePolicyHost(url.hostname) };
  } catch {
    return { ok: false, message: `invalid URL \`${trimmed}\` for domain allowlist` };
  }
}

function explicitNonHttpScheme(input: string) {
  const lower = input.toLowerCase();
  const match = lower.match(/^([a-z][a-z0-9+.-]*):/);
  if (!match || lower.includes("://")) return "";
  const scheme = match[1];
  return ["about", "blob", "chrome", "data", "file", "javascript", "mailto", "moz-extension", "resource"].includes(scheme) ? scheme : "";
}

function normalizePolicyHost(host: string) {
  return host.toLowerCase().replace(/\.+$/, "");
}

function domainPatternMatches(pattern: string, host: string) {
  const normalizedPattern = normalizePolicyHost(pattern);
  const normalizedHost = normalizePolicyHost(host);
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(2);
    return normalizedHost !== suffix && normalizedHost.endsWith(`.${suffix}`);
  }
  return normalizedHost === normalizedPattern;
}

// Maintainer note: update this list whenever a command reads, mutates, captures,
// navigates within, or otherwise acts on the active page. Destination-bearing
// commands such as open/goto/navigate and tabs new are handled separately by
// domainPolicyDestinationUrl.
function commandNeedsActivePageDomainCheck(args: string[]) {
  const [command, subcommand] = args;
  if (
    [
      "snapshot",
      "find",
      "click",
      "dblclick",
      "tap",
      "fill",
      "type",
      "press",
      "key",
      "keyboard",
      "keydown",
      "keyup",
      "hover",
      "focus",
      "select",
      "check",
      "uncheck",
      "scroll",
      "scrollintoview",
      "scrollinto",
      "swipe",
      "mouse",
      "drag",
      "screenshot",
      "read",
      "get",
      "is",
      "eval",
      "console",
      "errors",
      "highlight",
      "pushstate",
      "back",
      "forward",
      "reload",
      "cookies",
      "storage",
      "download",
      "upload",
      "set",
      "device",
      "trace",
      "profiler",
      "record",
      "vitals",
      "react",
    ].includes(command ?? "")
  ) {
    return true;
  }
  if (command === "wait") return waitCommandTouchesActivePage(args.slice(1));
  if (command === "clipboard") return subcommand === "copy" || subcommand === "paste";
  if (command === "state") return subcommand === "export" || subcommand === "import";
  return false;
}

function waitCommandTouchesActivePage(args: string[]) {
  if (args.includes("--download")) return true;
  if (args.some((arg) => ["--load", "--selector", "--text", "--url", "--fn"].includes(arg))) return true;
  const first = args.find((arg) => !arg.startsWith("--"));
  return Boolean(first && Number.isNaN(Number(first)));
}

async function executeCommand(
  args: string[],
  domainPolicy: DomainPolicyContext | null = null,
  actionPolicy: ActionPolicyContext | null = null,
  confirmationPolicy: ConfirmationPolicyContext | null = null,
  params: Record<string, any> = {}
): Promise<Record<string, unknown>> {
  const [command, ...rest] = args;
  const requestedColorScheme = normalizeContentColorScheme(params.colorScheme);
  if ("error" in requestedColorScheme) return requestedColorScheme;
  if (requestedColorScheme.scheme) {
    const applied = await applyContentColorScheme(requestedColorScheme.scheme);
    if ("error" in applied) return applied;
    params.appliedColorScheme = applied.media;
  }
  const proxyResult = await applyProxyFromParams(params.proxy);
  if ("error" in proxyResult) return proxyResult;
  if (proxyResult.proxy) params.appliedProxy = proxyResult.proxy;
  if (proxyResult.warnings?.length) params.proxyWarnings = proxyResult.warnings;
  switch (command) {
    case "status":
      return statusResult();
    case "open":
    case "goto":
    case "navigate":
      return openCommand(rest, command || "open", params);
    case "read":
      return readCommand(rest);
    case "snapshot":
      return snapshotCommand(rest);
    case "diff":
      return diffCommand(rest, params);
    case "find":
      return findCommand(rest);
    case "click":
    case "tap":
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
    case "highlight":
    case "scrollintoview":
      return targetActionCommand(command, rest);
    case "scrollinto":
      return targetActionCommand("scrollintoview", rest);
    case "select":
      return targetActionCommand("select", rest);
    case "check":
    case "uncheck":
      return targetActionCommand(command, rest);
    case "scroll":
      return scrollCommand(rest);
    case "swipe":
      return swipeCommand(rest);
    case "mouse":
      return mouseCommand(rest);
    case "drag":
      return dragCommand(rest);
    case "wait":
      return waitCommand(rest);
    case "screenshot":
      return screenshotCommand(rest, params);
    case "get":
      return getCommand(rest);
    case "is":
      return isCommand(rest);
    case "eval":
      return evalCommand(rest);
    case "setcontent":
      return setContentCommand(rest);
    case "pushstate":
      return pushStateCommand(rest, domainPolicy);
    case "console":
      return debugLogCommand("console", rest);
    case "errors":
      return debugLogCommand("errors", rest);
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
      return batchCommand(rest, domainPolicy, actionPolicy, confirmationPolicy, params);
    case "cookies":
      return cookiesCommand(rest);
    case "storage":
      return storageCommand(rest);
    case "state":
      return stateCommand(rest);
    case "clipboard":
      return clipboardCommand(rest);
    case "download":
      return downloadCommand(rest);
    case "upload":
      return uploadCommand(rest, params);
    case "auth":
      return authCommand(rest, domainPolicy);
    case "network":
      return networkCommand(rest);
    case "vitals":
      return vitalsCommand(rest, domainPolicy);
    case "react":
      return reactCommand(rest);
    case "trace":
      return traceCommand(rest);
    case "profiler":
      return profilerCommand(rest);
    case "record":
      return recordCommand(rest);
    case "addinitscript":
      return addInitScriptCommand(rest);
    case "removeinitscript":
      return removeInitScriptCommand(rest);
    case "set":
      return setCommand(rest);
    case "device":
      return setDeviceCommand(rest, "device");
    case "install":
    case "upgrade":
    case "stream":
    case "dashboard":
    case "confirm":
    case "deny":
    case "session":
    case "profiles":
    case "pdf":
    case "connect":
      return notAvailable(command, "This command is not supported by the Firefox WebExtension backend yet.");
    case "close":
    case "quit":
    case "exit":
      scheduleControlledClose();
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

async function openCommand(args: string[], command = "open", params: Record<string, any> = {}) {
  const url = firstPositionalArg(args, ["--label", "--init-script", "--headers", "--enable"]);
  const enableOption = parseOpenEnableOption(args);
  if ("error" in enableOption) return enableOption;
  const initScripts = parseInitScripts(params.initScripts);
  if ("error" in initScripts) return initScripts;
  if (initScripts.scripts.length > 0 && !url) {
    return { error: { code: "invalid_args", message: "--init-script requires <url>" } };
  }
  const parsedHeaders = parseHeadersOption(valueAfter(args, "--headers"), "open --headers");
  if ("error" in parsedHeaders) return parsedHeaders;
  if (parsedHeaders.provided && !url) {
    return { error: { code: "invalid_args", message: "open --headers requires <url>" } };
  }
  if (!url) {
    if (command !== "open") {
      return { error: { code: "invalid_args", message: `${command} requires <url>` } };
    }
    const tab = await targetTab();
    return { text: openTabText(tab), tab };
  }
  const label = valueAfter(args, "--label");
  const newTab = args.includes("--new") || args.includes("--new-tab");
  const openInitScripts = enableOption.reactDevtools
    ? [reactDevtoolsHookInitScript(), ...initScripts.scripts]
    : initScripts.scripts;
  const registered = await registerInitScripts(openInitScripts);
  if ("error" in registered) return registered;
  const headerScope = parsedHeaders.provided ? setHeadersForUrl(url, parsedHeaders.headers) : null;
  if (headerScope && "error" in headerScope) return headerScope;
  const active = await activeTab();
  const previousUrl = active?.url;
  let tab: any;
  const warnings: unknown[] = mergeWarnings(params.proxyWarnings, registered.warnings);
  if (enableOption.reactDevtools) {
    warnings.push(
      bestEffortWarning(
        "react",
        "Installed a best-effort React DevTools-compatible hook before navigation. Firefox render recording uses this lightweight hook plus Fiber data, not the full React DevTools extension."
      )
    );
  }
  try {
    const existingFileTab = isFileUrl(url) ? await existingTabForUrl(url, active) : null;
    tab = existingFileTab
      ? await browser.tabs.update(existingFileTab.id, { active: true })
      : newTab || !active?.id
        ? await browser.tabs.create({ url, active: true })
        : await browser.tabs.update(active.id, { url, active: true });
    await waitForTabReady(tab.id, url, previousUrl, 10000);
  } catch (error) {
    const existingFileTab = isFileUrl(url) ? await existingTabForUrl(url, active) : null;
    if (existingFileTab) {
      tab = await browser.tabs.update(existingFileTab.id, { active: true });
      warnings.push(
        structuredWarning(
          "NAVIGATION_RECOVERED",
          "open",
          "Firefox blocked extension navigation to a file URL, but the managed tab is already inspectable."
        )
      );
    } else {
      const current = tab?.id ? await browser.tabs.get(tab.id).catch(() => null) : null;
      if (!isInspectableTab(current)) throw error;
      warnings.push(
        structuredWarning(
          "NAVIGATION_RECOVERED",
          "open",
          "Page readiness timed out, but the tab is inspectable. Continue with `pire-browser snapshot -i` or an explicit wait."
        )
      );
    }
  } finally {
    await unregisterInitScripts(registered.registrations);
  }
  const loadedTab = await browser.tabs.get(tab.id);
  const record = rememberTab(loadedTab);
  selectedFramesByTabId.delete(record.tabId);
  recentDialogsByTabId.delete(record.tabId);
  if (label) setLabel(record, label);
  await activatePage(record);
  return {
    text: [`Opened ${url} in ${record.agentId}${label ? ` (${label})` : ""}`, ...warnings.map(formatWarningLine)].join("\n"),
    tab: record,
    headers: headerScope ? headerScope.headers : undefined,
    media: params.appliedColorScheme,
    proxy: params.appliedProxy,
    warnings,
  };
}

function parseOpenEnableOption(args: string[]): { reactDevtools: boolean } | { error: RpcResponse["error"] } {
  const inline = args.find((arg) => arg.startsWith("--enable="));
  const value = inline ? inline.slice("--enable=".length) : valueAfter(args, "--enable");
  if (!inline && args.includes("--enable") && (!value || value.startsWith("--"))) {
    return { error: { code: "invalid_args", message: "open --enable requires a feature name such as react-devtools" } };
  }
  if (!value) return { reactDevtools: false };
  if (value !== "react-devtools") {
    return { error: { code: "invalid_args", message: `Unsupported open --enable feature: ${value}` } };
  }
  return { reactDevtools: true };
}

async function existingTabForUrl(url: string, preferred?: any) {
  if (sameNavigationUrl(preferred?.url, url) && typeof preferred?.id === "number") return preferred;
  const tabs = await browser.tabs.query({}).catch(() => []);
  return tabs.find((tab: any) => sameNavigationUrl(tab?.url, url) && typeof tab?.id === "number") ?? null;
}

function isFileUrl(url: string) {
  return /^file:/i.test(url.trim());
}

function sameNavigationUrl(left: unknown, right: unknown) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  try {
    return new URL(left).href === new URL(right).href;
  } catch {
    return left === right;
  }
}

function parseInitScripts(value: unknown): { scripts: InitScriptPayload[] } | { error: RpcResponse["error"] } {
  if (value == null) return { scripts: [] };
  if (!Array.isArray(value)) {
    return { error: { code: "invalid_args", message: "initScripts payload must be an array" } };
  }
  const scripts: InitScriptPayload[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { error: { code: "invalid_args", message: "initScripts payload entry must be an object" } };
    }
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.path !== "string" || typeof candidate.code !== "string") {
      return { error: { code: "invalid_args", message: "initScripts payload entry requires path and code" } };
    }
    scripts.push({ path: candidate.path, code: candidate.code });
  }
  return { scripts };
}

function reactDevtoolsHookInitScript(): InitScriptPayload {
  return {
    path: "react-devtools-hook",
    code: `(() => {
  if (window.__PIRE_BROWSER_REACT_RENDER_RECORDER__) return;
  const existing = window.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  const state = {
    nextRendererId: 1,
    renderers: {},
    recording: false,
    startedAt: 0,
    stoppedAt: 0,
    commits: [],
    maxCommits: 200,
    maxComponentsPerCommit: 300,
  };
  const hook = existing && typeof existing === "object" ? existing : {};
  const originalInject = typeof hook.inject === "function" ? hook.inject.bind(hook) : null;
  const originalCommit = typeof hook.onCommitFiberRoot === "function" ? hook.onCommitFiberRoot.bind(hook) : null;
  if (!hook.renderers || typeof hook.renderers.set !== "function") hook.renderers = new Map();
  hook.supportsFiber = true;
  hook.inject = function(renderer) {
    let rendererId;
    if (originalInject) {
      try {
        rendererId = originalInject(renderer);
      } catch {
        rendererId = undefined;
      }
    }
    if (typeof rendererId !== "number") rendererId = state.nextRendererId++;
    state.nextRendererId = Math.max(state.nextRendererId, rendererId + 1);
    try {
      hook.renderers.set(rendererId, renderer);
    } catch {}
    state.renderers[String(rendererId)] = rendererSummary(renderer);
    return rendererId;
  };
  hook.onCommitFiberRoot = function(rendererId, root, priorityLevel, didError) {
    if (state.recording) recordCommit(rendererId, root, didError);
    if (originalCommit) {
      try {
        return originalCommit(rendererId, root, priorityLevel, didError);
      } catch {}
    }
    return undefined;
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = hook;
  window.__PIRE_BROWSER_REACT_RENDER_RECORDER__ = {
    start() {
      state.recording = true;
      state.startedAt = Date.now();
      state.stoppedAt = 0;
      state.commits = [];
      return profile(false);
    },
    stop() {
      if (!state.recording) return { error: { code: "ReactRenderRecordingNotActive", message: "No React render recording is active. Run react renders start first." } };
      state.recording = false;
      state.stoppedAt = Date.now();
      return profile(true);
    },
    status() {
      return profile(false);
    }
  };
  function recordCommit(rendererId, root, didError) {
    const fiberRoot = root && (root.current || root._internalRoot?.current || root);
    const components = collectComponents(fiberRoot);
    const commit = {
      id: state.commits.length + 1,
      at: Date.now(),
      rendererId: typeof rendererId === "number" ? rendererId : null,
      didError: Boolean(didError),
      componentCount: components.length,
      components,
    };
    state.commits.push(commit);
    if (state.commits.length > state.maxCommits) state.commits.shift();
  }
  function collectComponents(rootFiber) {
    const out = [];
    const stack = rootFiber ? [rootFiber] : [];
    const seen = new Set();
    while (stack.length && out.length < state.maxComponentsPerCommit) {
      const fiber = stack.pop();
      if (!fiber || seen.has(fiber)) continue;
      seen.add(fiber);
      if (fiber.sibling) stack.push(fiber.sibling);
      if (fiber.child) stack.push(fiber.child);
      if (!isComponentFiber(fiber)) continue;
      const actualDuration = finiteNumber(fiber.actualDuration);
      const selfDuration = finiteNumber(fiber.selfBaseDuration);
      const flags = finiteNumber(fiber.flags) || 0;
      const rendered = actualDuration > 0 || flags !== 0;
      if (!rendered) continue;
      out.push({
        name: fiberDisplayName(fiber),
        key: fiber.key == null ? null : String(fiber.key),
        actualDuration,
        selfDuration,
        flags,
        source: fiberSource(fiber),
      });
    }
    return out;
  }
  function profile(stopped) {
    const components = {};
    for (const commit of state.commits) {
      for (const component of commit.components) {
        const key = component.name || "Anonymous";
        const entry = components[key] || { name: key, renders: 0, actualDuration: 0, selfDuration: 0 };
        entry.renders += 1;
        entry.actualDuration += component.actualDuration || 0;
        entry.selfDuration += component.selfDuration || 0;
        components[key] = entry;
      }
    }
    const topComponents = Object.values(components)
      .sort((left, right) => (right.renders - left.renders) || (right.actualDuration - left.actualDuration) || String(left.name).localeCompare(String(right.name)))
      .slice(0, 25);
    const stoppedAt = stopped ? state.stoppedAt : Date.now();
    return {
      recording: state.recording,
      startedAt: state.startedAt || null,
      stoppedAt: stopped ? state.stoppedAt : null,
      durationMs: state.startedAt ? Math.max(0, stoppedAt - state.startedAt) : 0,
      commitCount: state.commits.length,
      componentRenderCount: topComponents.reduce((sum, component) => sum + component.renders, 0),
      rendererCount: Object.keys(state.renderers).length,
      renderers: state.renderers,
      commits: state.commits,
      topComponents,
      capped: state.commits.length >= state.maxCommits,
    };
  }
  function isComponentFiber(fiber) {
    const type = fiber.elementType || fiber.type;
    if (!type || typeof type === "string") return false;
    if (typeof type === "function") return true;
    return typeof type === "object" && Boolean(type.displayName || type.render || type.type);
  }
  function fiberDisplayName(fiber) {
    return typeName(fiber.elementType || fiber.type) || typeName(fiber.type) || "Anonymous";
  }
  function typeName(type) {
    if (!type) return "";
    if (typeof type === "string") return type;
    if (typeof type === "function") return type.displayName || type.name || "Anonymous";
    if (typeof type === "object") {
      if (typeof type.displayName === "string" && type.displayName) return type.displayName;
      if (type.render) return typeName(type.render) || "ForwardRef";
      if (type.type) return typeName(type.type);
    }
    return "";
  }
  function rendererSummary(renderer) {
    if (!renderer || typeof renderer !== "object") return {};
    return {
      bundleType: renderer.bundleType,
      version: typeof renderer.version === "string" ? renderer.version : undefined,
      rendererPackageName: typeof renderer.rendererPackageName === "string" ? renderer.rendererPackageName : undefined,
    };
  }
  function fiberSource(fiber) {
    const source = fiber && fiber._debugSource;
    if (!source || typeof source !== "object") return null;
    return {
      fileName: typeof source.fileName === "string" ? source.fileName : undefined,
      lineNumber: typeof source.lineNumber === "number" ? source.lineNumber : undefined,
      columnNumber: typeof source.columnNumber === "number" ? source.columnNumber : undefined,
    };
  }
  function finiteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  }
})();`,
  };
}

async function registerInitScripts(
  scripts: InitScriptPayload[]
): Promise<{ registrations: any[]; warnings: unknown[] } | { error: RpcResponse["error"] }> {
  if (scripts.length === 0) return { registrations: [], warnings: [] };
  if (typeof browser.contentScripts?.register !== "function") {
    return {
      error: {
        code: "not_available",
        message: "open --init-script requires Firefox contentScripts.register support.",
      },
    };
  }
  const registrations: any[] = [];
  try {
    for (const script of scripts) {
      registrations.push(
        await browser.contentScripts.register({
          matches: ["<all_urls>"],
          js: [{ code: initScriptContentScript(script) }],
          runAt: "document_start",
          allFrames: true,
          matchAboutBlank: true,
        })
      );
    }
  } catch (error) {
    await unregisterInitScripts(registrations);
    throw error;
  }
  return {
    registrations,
    warnings: [
      bestEffortWarning(
        "open --init-script",
        "Registered init script(s) for this navigation. Firefox WebExtension init scripts are best effort and can be limited by page CSP or browser injection timing."
      ),
    ],
  };
}

async function addInitScriptCommand(args: string[]) {
  const code = args.join(" ").trim();
  if (!code) {
    return { error: { code: "invalid_args", message: "addinitscript requires <js>" } };
  }
  if (typeof browser.contentScripts?.register !== "function") {
    return {
      error: {
        code: "not_available",
        message: "addinitscript requires Firefox contentScripts.register support.",
      },
    };
  }

  const id = `init${nextRuntimeInitScriptNumber++}`;
  const registration = await browser.contentScripts.register({
    matches: ["<all_urls>"],
    js: [{ code: initScriptContentScript({ path: id, code }) }],
    runAt: "document_start",
    allFrames: true,
    matchAboutBlank: true,
  });
  runtimeInitScripts.set(id, { id, registration, code });
  return {
    text: `Registered init script ${id}`,
    id,
    warnings: [
      bestEffortWarning(
        "addinitscript",
        "Registered runtime init script. Firefox WebExtension init scripts are best effort and can be limited by page CSP or browser injection timing."
      ),
    ],
  };
}

async function removeInitScriptCommand(args: string[]) {
  const id = args[0];
  if (!id) {
    return { error: { code: "invalid_args", message: "removeinitscript requires <identifier>" } };
  }
  const record = runtimeInitScripts.get(id);
  if (!record) {
    return { error: { code: "not_found", message: `No init script registered as ${id}` } };
  }
  await unregisterInitScripts([record.registration]);
  runtimeInitScripts.delete(id);
  return {
    text: `Removed init script ${id}`,
    id,
    warnings: [
      bestEffortWarning(
        "removeinitscript",
        "Removed runtime init script registration. Pages already loaded before removal are not retroactively changed."
      ),
    ],
  };
}

async function unregisterInitScripts(registrations: any[]) {
  for (const registration of registrations) {
    try {
      await registration.unregister();
    } catch {
      // Registration cleanup is best effort; the browser may already have unloaded.
    }
  }
}

function initScriptContentScript(script: InitScriptPayload) {
  const sourceUrl = `pire-browser-init-script-${script.path.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(-80)}.js`;
  const source = `${script.code}\n//# sourceURL=${sourceUrl}`;
  return `(() => {
  const script = document.createElement("script");
  script.textContent = ${JSON.stringify(source)};
  const target = document.documentElement || document.head || document.body;
  if (!target) return;
  target.appendChild(script);
  script.remove();
})();`;
}

function formatWarningLine(warning: unknown) {
  if (warning && typeof warning === "object") {
    const candidate = warning as Record<string, unknown>;
    if (typeof candidate.message === "string") {
      const code = typeof candidate.code === "string" ? ` [${candidate.code}]` : "";
      return `Warning${code}: ${candidate.message}`;
    }
  }
  return `Warning: ${String(warning)}`;
}

type ReadOptions = {
  filter?: string;
  outline: boolean;
};

async function readCommand(args: string[]) {
  const options = parseReadOptions(args);
  if ("error" in options) return options;
  const tab = await targetTab();
  if (typeof browser.tabs?.executeScript !== "function") {
    return {
      error: {
        code: "not_available",
        message: "read requires Firefox tabs.executeScript support.",
      },
    };
  }
  const results = await browser.tabs.executeScript(tab.tabId, {
    code: activeReadScript(options),
    allFrames: false,
    matchAboutBlank: true,
  });
  const read = Array.isArray(results) ? results[0] : undefined;
  if (!read || typeof read !== "object") {
    return { error: { code: "command_failed", message: "read did not return active-tab text" } };
  }
  const payload = read as Record<string, unknown>;
  const text = typeof payload.text === "string" ? payload.text : "";
  return {
    text,
    read: {
      source: "active-tab",
      kind: options.outline ? "outline" : "rendered",
      url: typeof payload.url === "string" ? payload.url : tab.url,
      title: typeof payload.title === "string" ? payload.title : tab.title,
      filter: options.filter,
      outline: Array.isArray(payload.outline) ? payload.outline : undefined,
      length: text.length,
    },
  };
}

function parseReadOptions(args: string[]): ReadOptions | { error: RpcResponse["error"] } {
  let filter: string | undefined;
  let outline = false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--json") continue;
    if (arg === "--outline") {
      outline = true;
      continue;
    }
    if (arg === "--filter") {
      filter = args[index + 1];
      if (!filter || filter.startsWith("-")) {
        return { error: { code: "invalid_args", message: "--filter requires text" } };
      }
      index += 1;
      continue;
    }
    if (["--raw", "--require-md", "--timeout"].includes(arg)) {
      return {
        error: {
          code: "invalid_args",
          message: `${arg} is handled by the CLI URL reader; run \`pire-browser read ${arg}\` to use the active tab URL or \`pire-browser read <url> ${arg}\`.`,
        },
      };
    }
    if (arg === "--llms") {
      return {
        error: {
          code: "invalid_args",
          message:
            "--llms is handled by the CLI URL reader; run `pire-browser read --llms index|full` to use the active tab URL or `pire-browser read <url> --llms index|full`.",
        },
      };
    }
    if (arg.startsWith("-")) {
      return { error: { code: "invalid_args", message: `Unsupported read option: ${arg}` } };
    }
    return {
      error: {
        code: "invalid_args",
        message: "read <url> is a CLI no-browser fetch. For the active tab, run `pire-browser read` without a URL.",
      },
    };
  }
  return { filter, outline };
}

function activeReadScript(options: ReadOptions) {
  const payload = JSON.stringify(options);
  return `(() => {
  const options = ${payload};
  const normalize = (value) => String(value || "")
    .replace(/\\r/g, "\\n")
    .split("\\n")
    .map((line) => line.replace(/\\s+/g, " ").trim())
    .filter(Boolean)
    .join("\\n");
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((element) => {
    const level = Number(element.tagName.slice(1)) || 1;
    return "#".repeat(level) + " " + normalize(element.textContent || "");
  }).filter((line) => line.trim().length > 1);
  const filter = typeof options.filter === "string" && options.filter.trim()
    ? options.filter.trim().toLowerCase()
    : "";
  const baseText = options.outline ? headings.join("\\n") : normalize(document.body?.innerText || document.documentElement?.innerText || "");
  let text = baseText;
  if (filter) {
    let currentHeading = "";
    const lines = [];
    for (const line of baseText.split("\\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#")) currentHeading = trimmed;
      if (trimmed.toLowerCase().includes(filter)) {
        if (currentHeading && lines[lines.length - 1] !== currentHeading) lines.push(currentHeading);
        lines.push(trimmed);
      }
    }
    text = lines.join("\\n");
  }
  return { text, outline: headings, url: location.href, title: document.title };
})();`;
}

async function snapshotCommand(args: string[]) {
  const tab = await targetTab();
  const options = parseSnapshotOptions(args);
  if ("error" in options) return options;
  const frames = await snapshotTab(
    tab.tabId,
    options.selector,
    options.depth,
    selectedFrameIdForTab(tab.tabId),
    options.cursorInteractive
  );
  if (options.selector && !frames.some((frame) => frame.elements.length > 0)) {
    return { error: { code: "not_found", message: `No element matched snapshot scope: ${options.selector}` } };
  }
  const interactiveFrames = options.interactive ? interactiveSnapshotFrames(frames) : frames;
  const printableFrames = options.compact ? compactSnapshotFrames(interactiveFrames) : interactiveFrames;
  refs.clear();
  let refNumber = 1;
  const treeOutput = !options.interactive;
  const lines: string[] = treeOutput ? [] : [`${tab.agentId} ${tab.title || tab.url || ""}`.trim()];

  for (const frame of printableFrames) {
    if (frame.opaque) {
      lines.push(treeOutput ? `- frame ${frame.frameId}: opaque ${frame.url ?? ""}`.trim() : `  frame ${frame.frameId}: opaque ${frame.url ?? ""}`.trim());
      continue;
    }
    if (treeOutput) lines.push(snapshotFrameHeader(frame));
    const baseDepth = snapshotBaseDepth(frame.elements);
    for (const element of frame.elements) {
      const ref = `@e${refNumber++}`;
      element.ref = ref;
      refs.set(ref, {
        tabId: tab.tabId,
        frameId: frame.frameId,
        locator: element.locator,
        summary: summarizeElement(element, options),
      });
      lines.push(
        treeOutput
          ? snapshotTreeLine(element, ref, options, baseDepth)
          : `  ${ref} ${summarizeElement(element, options)}`
      );
    }
  }

  const text = lines.join("\n");
  lastSnapshotTextByTabId.set(tab.tabId, text);
  return withDialogs({ text, frames: printableFrames, refs: Array.from(refs.keys()) }, printableFrames);
}

async function diffCommand(args: string[], params: Record<string, any> = {}) {
  const [subcommand, ...rest] = args;
  if (subcommand !== "snapshot") {
    return {
      error: {
        code: "invalid_args",
        message: "diff requires snapshot in extension batch mode. Run `pire-browser diff screenshot --baseline <path>` or `pire-browser diff url <url1> <url2>` as top-level CLI commands for visual and URL diff workflows.",
      },
    };
  }
  return diffSnapshotCommand(rest, params);
}

async function diffSnapshotCommand(args: string[], params: Record<string, any>) {
  const invalid = invalidDiffSnapshotArgs(args);
  if (invalid) return invalid;
  const tab = await targetTab();
  const baselineText =
    typeof params.diffBaselineText === "string"
      ? params.diffBaselineText
      : lastSnapshotTextByTabId.get(tab.tabId);
  const baselinePath = typeof params.diffBaselinePath === "string" ? params.diffBaselinePath : undefined;
  if (baselineText === undefined) {
    return {
      error: {
        code: "invalid_state",
        message: "No previous snapshot is available. Run `snapshot -i` first or pass `diff snapshot --baseline <path>`.",
      },
    };
  }
  const snapshotArgs = diffSnapshotArgs(args);
  const current = await snapshotCommand(snapshotArgs);
  if ("error" in current) return current;
  const currentText = typeof current.text === "string" ? current.text : "";
  const diff = unifiedTextDiff(baselineText, currentText, baselinePath ?? "previous snapshot", "current snapshot");
  const added = diff.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = diff.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  const changed = added > 0 || removed > 0;
  return {
    ...current,
    text: changed ? diff.join("\n") : "No snapshot differences",
    diff: diff.join("\n"),
    changed,
    added,
    removed,
    baseline: {
      source: baselinePath ? "file" : "previous",
      path: baselinePath,
    },
    currentSnapshot: currentText,
  };
}

function invalidDiffSnapshotArgs(args: string[]) {
  const valueFlags = new Set(["--baseline", "--selector", "--scope", "-s", "--depth", "-d"]);
  const boolFlags = new Set(["-i", "--interactive", "-c", "--compact", "-C", "--cursor-interactive", "-u", "--urls", "--json"]);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        return { error: { code: "invalid_args", message: `diff snapshot ${arg} requires a value` } };
      }
      index += 1;
      continue;
    }
    if (boolFlags.has(arg)) continue;
    if (arg.startsWith("--depth=")) continue;
    return { error: { code: "invalid_args", message: `diff snapshot does not support argument: ${arg}` } };
  }
  return null;
}

function diffSnapshotArgs(args: string[]) {
  const snapshotArgs: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--baseline") {
      index += 1;
      continue;
    }
    if (arg === "--selector") {
      snapshotArgs.push("--scope", args[index + 1]);
      index += 1;
      continue;
    }
    snapshotArgs.push(arg);
  }
  return snapshotArgs;
}

function unifiedTextDiff(before: string, after: string, beforeName: string, afterName: string) {
  if (before === after) return [];
  const beforeLines = before.split(/\r?\n/);
  const afterLines = after.split(/\r?\n/);
  return [`--- ${beforeName}`, `+++ ${afterName}`, ...diffLines(beforeLines, afterLines)];
}

function diffLines(before: string[], after: string[]) {
  const table = Array.from({ length: before.length + 1 }, () => Array(after.length + 1).fill(0));
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      table[i][j] = before[i] === after[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      lines.push(` ${before[i]}`);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push(`-${before[i]}`);
      i += 1;
    } else {
      lines.push(`+${after[j]}`);
      j += 1;
    }
  }
  while (i < before.length) lines.push(`-${before[i++]}`);
  while (j < after.length) lines.push(`+${after[j++]}`);
  return compactDiffContext(lines, 3);
}

function compactDiffContext(lines: string[], contextSize: number) {
  const changed = lines.map((line, index) => ({ line, index })).filter((item) => item.line.startsWith("+") || item.line.startsWith("-"));
  if (!changed.length) return [];
  const keep = new Set<number>();
  for (const item of changed) {
    for (let index = Math.max(0, item.index - contextSize); index <= Math.min(lines.length - 1, item.index + contextSize); index++) {
      keep.add(index);
    }
  }
  const compacted: string[] = [];
  let previous = -1;
  for (const index of Array.from(keep).sort((left, right) => left - right)) {
    if (previous >= 0 && index > previous + 1) compacted.push("...");
    compacted.push(lines[index]);
    previous = index;
  }
  return compacted;
}

type SnapshotOptions = {
  interactive: boolean;
  compact: boolean;
  cursorInteractive: boolean;
  urls: boolean;
  selector?: string;
  depth?: number;
};

function parseSnapshotOptions(args: string[]): SnapshotOptions | { error: RpcResponse["error"] } {
  let selector: string | undefined;
  let depth: number | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "-s" || arg === "--scope" || arg === "--selector") {
      selector = args[index + 1];
      if (!selector || selector.startsWith("-")) {
        return { error: { code: "invalid_args", message: `${arg} requires a CSS selector` } };
      }
      index += 1;
      continue;
    }
    if (arg === "-d" || arg === "--depth") {
      const parsed = parseSnapshotDepth(args[index + 1], arg);
      if ("error" in parsed) return parsed;
      depth = parsed.depth;
      index += 1;
      continue;
    }
    if (arg.startsWith("--depth=")) {
      const parsed = parseSnapshotDepth(arg.slice("--depth=".length), "--depth");
      if ("error" in parsed) return parsed;
      depth = parsed.depth;
      continue;
    }
    if (["-i", "--interactive", "-c", "--compact", "-C", "--cursor-interactive", "-u", "--urls", "--json"].includes(arg)) continue;
    if (arg.startsWith("-")) {
      return { error: { code: "invalid_args", message: `Unsupported snapshot option: ${arg}` } };
    }
  }
  return {
    interactive: args.includes("-i") || args.includes("--interactive"),
    compact: args.includes("-c") || args.includes("--compact"),
    cursorInteractive: args.includes("-C") || args.includes("--cursor-interactive"),
    urls: args.includes("-u") || args.includes("--urls"),
    selector,
    depth,
  };
}

function parseSnapshotDepth(value: string | undefined, flag: string): { depth: number } | { error: RpcResponse["error"] } {
  if (!value || value.startsWith("-")) {
    return { error: { code: "invalid_args", message: `${flag} requires a non-negative integer depth` } };
  }
  const depth = Number(value);
  if (!Number.isInteger(depth) || depth < 0) {
    return { error: { code: "invalid_args", message: `${flag} requires a non-negative integer depth` } };
  }
  return { depth };
}

function interactiveSnapshotFrames(frames: FrameSnapshot[]): FrameSnapshot[] {
  return frames.map((frame) => ({
    ...frame,
    elements: frame.elements.filter(isInteractiveSnapshotElement),
  }));
}

function compactSnapshotFrames(frames: FrameSnapshot[]): FrameSnapshot[] {
  return frames.map((frame) => ({
    ...frame,
    elements: frame.elements.filter(isCompactSnapshotElement).sort(compareSnapshotElements),
  }));
}

function isInteractiveSnapshotElement(element: ElementSnapshot) {
  if (isActionableRole(element.role)) return true;
  if (element.cursorInteractive) return Boolean(element.name || element.text || element.testid);
  if (["heading", "iframe", "tab", "menuitem"].includes(element.role)) return Boolean(element.name || element.text);
  if (element.testid || element.label || element.placeholder) return element.role !== "generic";
  return false;
}

function isCompactSnapshotElement(element: ElementSnapshot) {
  if (element.disabled) return false;
  if (isActionableRole(element.role)) return true;
  if (element.testid || element.label || element.placeholder) return true;
  if (element.role === "generic") return false;
  return Boolean(element.name || element.text);
}

function compareSnapshotElements(left: ElementSnapshot, right: ElementSnapshot) {
  const roleScore = snapshotRoleScore(left) - snapshotRoleScore(right);
  if (roleScore !== 0) return roleScore;
  const topScore = Math.max(0, left.bounds.y) - Math.max(0, right.bounds.y);
  if (topScore !== 0) return topScore;
  return Math.max(0, left.bounds.x) - Math.max(0, right.bounds.x);
}

function snapshotRoleScore(element: ElementSnapshot) {
  if (isActionableRole(element.role)) return 0;
  if (element.testid || element.label || element.placeholder) return 1;
  if (["heading", "img", "tab", "menuitem"].includes(element.role)) return 2;
  return 3;
}

function snapshotFrameHeader(frame: FrameSnapshot) {
  if (frame.frameId === 0) return "- main";
  const suffix = frame.title || frame.url || "";
  return `- frame ${frame.frameId}${suffix ? ` ${truncate(suffix, 100)}` : ""}`;
}

function snapshotBaseDepth(elements: ElementSnapshot[]) {
  const depths = elements
    .map((element) => element.depth)
    .filter((depth): depth is number => typeof depth === "number" && Number.isFinite(depth));
  return depths.length ? Math.min(...depths) : 0;
}

function snapshotTreeLine(
  element: ElementSnapshot,
  ref: string,
  options: Pick<SnapshotOptions, "urls">,
  baseDepth: number
) {
  const depth = typeof element.depth === "number" && Number.isFinite(element.depth) ? element.depth : baseDepth;
  const indentLevel = Math.max(1, Math.min(8, depth - baseDepth + 1));
  const indent = "  ".repeat(indentLevel);
  return `${indent}- ${summarizeTreeElement(element, ref, options)}`;
}

function summarizeTreeElement(element: ElementSnapshot, ref: string, options: Pick<SnapshotOptions, "urls">) {
  const name = element.name || element.label || element.placeholder || element.text;
  const url = options.urls && element.href ? ` ${truncate(element.href, 120)}` : "";
  const attrs = [element.disabled ? "disabled" : "", `ref=${ref}`].filter(Boolean).join(", ");
  return `${element.role}${name ? ` "${truncate(name, 80)}"` : ""}${url} [${attrs}]`;
}

function isActionableRole(role: string) {
  return [
    "button",
    "link",
    "textbox",
    "search",
    "combobox",
    "checkbox",
    "radio",
    "switch",
    "slider",
    "spinbutton",
    "option",
    "tab",
    "menuitem",
  ].includes(role);
}

async function findCommand(args: string[]) {
  const parsed = parseFind(args);
  if ("error" in parsed) return parsed;
  if (parsed.action) return actOnFind(parsed.locator, parsed.action, parsed.text ?? "");

  const tab = await targetTab();
  const frames = await findInTab(tab.tabId, parsed.locator, selectedFrameIdForTab(tab.tabId));
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
  const target = firstPositionalArg(args, []);
  const locator = locatorFromTarget(target);
  if ("error" in locator) return locator;
  const tab = await targetTab();
  const frameId = targetFrameIdForTab(tab.tabId, locator.frameId);
  if (args.includes("--new-tab") || args.includes("--new")) return clickNewTab(locator.locator, frameId);
  return clickLocator(locator.locator, frameId);
}

async function fillCommand(args: string[]) {
  const locator = locatorFromTarget(args[0]);
  if ("error" in locator) return locator;
  const text = args.slice(1).join(" ");
  const tab = await targetTab();
  return fillLocator(locator.locator, text, targetFrameIdForTab(tab.tabId, locator.frameId));
}

async function targetActionCommand(action: string, args: string[]) {
  const locator = locatorFromTarget(args[0]);
  if ("error" in locator) return locator;
  const text = args.slice(1).join(" ");
  const tab = await targetTab();
  const payload: Record<string, unknown> = { type: action, locator: locator.locator };
  if (action === "type") payload.text = text;
  if (action === "select") payload.value = text;
  const response = await sendFrame(tab.tabId, targetFrameIdForTab(tab.tabId, locator.frameId), payload, { staleOnFrameRoutingError: true });
  return normalizeContentResponse(response);
}

async function actOnFind(locator: Locator, action: string, text = "") {
  const canonicalAction = action === "scrollinto" ? "scrollintoview" : action;
  const tab = await targetTab();
  const frames = await findInTab(tab.tabId, locator, selectedFrameIdForTab(tab.tabId));
  const matches = frames.flatMap((frame) => frame.elements.map(() => frame.frameId));
  if (matches.length === 0) return { error: { code: "not_found", message: "No element matched locator" } };
  if (matches.length > 1) return { error: { code: "ambiguous_locator", message: `${matches.length} elements matched locator` } };
  if (canonicalAction === "click") return clickLocator(locator, matches[0]);
  if (canonicalAction === "fill") return fillLocator(locator, text, matches[0]);
  if (["text", "html", "value", "attr", "box", "styles"].includes(canonicalAction)) {
    const response = await sendFrame(tab.tabId, matches[0], { type: "get", locator, property: canonicalAction, attribute: text }, { staleOnFrameRoutingError: true });
    return normalizeContentResponse(response);
  }
  const response = await sendFrame(tab.tabId, matches[0], { type: canonicalAction, locator, text, value: text, property: canonicalAction }, { staleOnFrameRoutingError: true });
  return normalizeContentResponse(response);
}

async function clickLocator(locator: Locator, frameId?: number) {
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, frameId, { type: "click", locator }, { staleOnFrameRoutingError: true });
  return normalizeContentResponse(response);
}

async function clickNewTab(locator: Locator, frameId?: number) {
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, frameId, { type: "click_new_tab", locator }, { staleOnFrameRoutingError: true });
  const result = normalizeContentResponse(response);
  if ("error" in result) return result;
  const href = typeof (result as any).href === "string" ? (result as any).href : typeof (result as any).value === "string" ? (result as any).value : "";
  if (!href) {
    return { error: { code: "unsupported_element", message: "click --new-tab requires a link with href" } };
  }
  let url: URL;
  try {
    url = new URL(href, tab.url || undefined);
  } catch {
    return { error: { code: "invalid_args", message: `click --new-tab could not resolve link URL: ${href}` } };
  }
  const created = await browser.tabs.create({ url: url.href, active: true });
  await waitForTabReady(created.id, url.href, undefined, 10000);
  const loadedTab = await browser.tabs.get(created.id);
  const record = markControlledPage(rememberTab(loadedTab));
  selectedFramesByTabId.delete(record.tabId);
  await activatePage(record);
  return {
    ...result,
    text: `Opened ${url.href} in ${record.agentId}`,
    tab: record,
    url: url.href,
  };
}

async function fillLocator(locator: Locator, text: string, frameId?: number) {
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, frameId, { type: "fill", locator, text }, { staleOnFrameRoutingError: true });
  return normalizeContentResponse(response);
}

async function pressCommand(args: string[]) {
  const key = args[0];
  if (!key) return { error: { code: "invalid_args", message: "press requires <key>" } };
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "press", key });
  return normalizeContentResponse(response);
}

async function keyboardCommand(args: string[]) {
  const [subcommand, ...rest] = args;
  if (subcommand !== "type" && subcommand !== "inserttext") {
    return { error: { code: "InvalidArgumentError", message: "keyboard requires type|inserttext <text>" } };
  }
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), {
    type: subcommand === "type" ? "keyboard_type" : "keyboard_inserttext",
    text: rest.join(" "),
  });
  return normalizeContentResponse(response);
}

async function keyEdgeCommand(command: string, args: string[]) {
  const key = args[0];
  if (!key) return { error: { code: "InvalidArgumentError", message: `${command} requires <key>` } };
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "key_edge", action: command, key });
  return normalizeContentResponse(response);
}

async function scrollCommand(args: string[]) {
  const direction = args[0] ?? "down";
  const pixels = Number(firstPositionalArg(args.slice(1), ["--selector"]) ?? "900");
  const selector = valueAfter(args, "--selector");
  if (!["up", "down", "left", "right"].includes(direction) || !Number.isFinite(pixels) || pixels <= 0) {
    return { error: { code: "InvalidArgumentError", message: "scroll requires up|down|left|right [positive_pixels]" } };
  }
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "scroll", direction, pixels, selector });
  return normalizeContentResponse(response);
}

async function swipeCommand(args: string[]) {
  const direction = args[0] ?? "up";
  const pixels = Number(firstPositionalArg(args.slice(1), ["--selector"]) ?? "500");
  const selector = valueAfter(args, "--selector");
  const scrollDirection = swipeScrollDirection(direction);
  if (!scrollDirection || !Number.isFinite(pixels) || pixels <= 0) {
    return { error: { code: "InvalidArgumentError", message: "swipe requires up|down|left|right [positive_pixels]" } };
  }
  const scrollArgs = [scrollDirection, String(pixels)];
  if (selector) scrollArgs.push("--selector", selector);
  const result = await scrollCommand(scrollArgs);
  if ("error" in result) return result;
  return {
    ...result,
    text: [`Swiped ${direction} ${pixels}px as best-effort page scroll ${scrollDirection}.`, (result as any).text]
      .filter(Boolean)
      .join("\n"),
    swipe: {
      direction,
      pixels,
      mappedScrollDirection: scrollDirection,
    },
    warnings: mergeWarnings(
      (result as any).warnings,
      bestEffortWarning(
        "swipe",
        "Firefox WebExtensions cannot dispatch native touch gestures; swipe maps touch direction to page scroll."
      )
    ),
  };
}

function swipeScrollDirection(direction: string) {
  switch (direction) {
    case "up":
      return "down";
    case "down":
      return "up";
    case "left":
      return "right";
    case "right":
      return "left";
    default:
      return null;
  }
}

async function mouseCommand(args: string[]) {
  const [subcommand = "", ...rest] = args;
  if (!["move", "down", "up", "wheel"].includes(subcommand)) {
    return { error: { code: "invalid_args", message: "mouse requires move <x> <y>, down [button], up [button], or wheel <dy> [dx]" } };
  }
  let payload: Record<string, unknown>;
  if (subcommand === "move") {
    const parsed = parseMouseCoordinates(rest);
    if ("error" in parsed) return parsed;
    payload = { type: "mouse_event", action: "move", x: parsed.x, y: parsed.y };
  } else if (subcommand === "wheel") {
    const dy = Number(rest[0]);
    const dx = rest[1] === undefined ? 0 : Number(rest[1]);
    if (!Number.isFinite(dy) || !Number.isFinite(dx)) {
      return { error: { code: "invalid_args", message: "mouse wheel requires numeric <dy> [dx]" } };
    }
    payload = { type: "mouse_event", action: "wheel", dy, dx };
  } else {
    payload = { type: "mouse_event", action: subcommand, button: mouseButton(rest[0]) };
  }
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), payload);
  const result = normalizeContentResponse(response);
  if ("error" in result) return result;
  return {
    ...result,
    warnings: mergeWarnings(
      (result as any).warnings,
      bestEffortWarning(
        "mouse",
        "Firefox WebExtensions dispatch page mouse events but cannot hold native OS mouse state or control browser chrome."
      )
    ),
  };
}

function parseMouseCoordinates(args: string[]): { x: number; y: number } | { error: RpcResponse["error"] } {
  const x = Number(args[0]);
  const y = Number(args[1]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return { error: { code: "invalid_args", message: "mouse move requires numeric <x> <y>" } };
  }
  return { x, y };
}

function mouseButton(value?: string) {
  if (value === "right") return 2;
  if (value === "middle") return 1;
  return 0;
}

async function dragCommand(args: string[]) {
  const [sourceTarget, destinationTarget] = args;
  if (!sourceTarget || !destinationTarget) {
    return { error: { code: "invalid_args", message: "drag requires <src> <dst>" } };
  }
  const source = locatorFromTarget(sourceTarget);
  if ("error" in source) return source;
  const destination = locatorFromTarget(destinationTarget);
  if ("error" in destination) return destination;
  if (
    typeof source.frameId === "number" &&
    typeof destination.frameId === "number" &&
    source.frameId !== destination.frameId
  ) {
    return {
      error: {
        code: "NotAvailableError",
        message: "drag across different frames is not available on the Firefox WebExtension backend.",
        data: { feature: "drag", status: "not_supported" },
      },
    };
  }
  const frameId = typeof source.frameId === "number" ? source.frameId : destination.frameId;
  const tab = await targetTab();
  const selectedFrameId = selectedFrameIdForTab(tab.tabId);
  const response = await sendFrame(
    tab.tabId,
    frameId ?? selectedFrameId,
    {
      type: "drag",
      sourceLocator: source.locator,
      targetLocator: destination.locator,
    },
    { staleOnFrameRoutingError: true }
  );
  const result = normalizeContentResponse(response);
  if ("error" in result) return result;
  return {
    ...result,
    warnings: mergeWarnings(
      (result as any).warnings,
      bestEffortWarning(
        "drag",
        "Firefox WebExtensions dispatch page drag/drop events but cannot hold native OS mouse state or drag across browser chrome."
      )
    ),
  };
}

async function waitCommand(args: string[]) {
  if (args.includes("--download")) return waitDownloadCommand(args);
  const timeoutResult = parseTimeoutOption(args, 10000);
  if ("error" in timeoutResult) return timeoutResult;
  const timeout = timeoutResult.ms;
  const selector = valueAfter(args, "--selector");
  if (args.includes("--load")) {
    const tab = await targetTab();
    const loadState = valueAfter(args, "--load") ?? "load";
    await waitForTabComplete(tab.tabId, timeout);
    if (loadState === "networkidle" || loadState === "network-idle") {
      return waitForNetworkIdle(tab.tabId, timeout, NETWORK_IDLE_QUIET_MS);
    }
    return { text: "Page load complete", loadState };
  }
  if (selector) {
    const tab = await targetTab();
    const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "wait_selector", selector, timeout, state: valueAfter(args, "--state") ?? "visible" });
    return normalizeContentResponse(response);
  }
  const text = valueAfter(args, "--text");
  if (text) {
    const tab = await targetTab();
    const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "wait_text", text, timeout, hidden: false });
    return normalizeContentResponse(response);
  }
  const urlPattern = valueAfter(args, "--url");
  if (urlPattern) return waitForUrl(urlPattern, timeout);
  const fn = valueAfter(args, "--fn");
  if (fn) {
    const tab = await targetTab();
    const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "wait_fn", expression: fn, timeout });
    return normalizeContentResponse(response);
  }
  const target = firstPositionalArg(args, ["--selector", "--text", "--url", "--fn", "--download", "--timeout", "--state", "--load"]);
  if (target && Number.isNaN(Number(target))) {
    const locator = locatorFromTarget(target);
    if ("error" in locator) return locator;
    const tab = await targetTab();
    const response = await sendFrame(
      tab.tabId,
      targetFrameIdForTab(tab.tabId, locator.frameId),
      { type: "wait_locator", locator: locator.locator, timeout, state: valueAfter(args, "--state") ?? "visible" },
      { staleOnFrameRoutingError: true }
    );
    return normalizeContentResponse(response);
  }
  const waitResult = parsePlainWaitMs(args);
  if ("error" in waitResult) return waitResult;
  await delay(waitResult.ms);
  return { text: `Waited ${waitResult.ms}ms` };
}

async function downloadCommand(args: string[]) {
  const parsed = parseDownloadCommand(args);
  if ("error" in parsed) return parsed;
  const tab = await targetTab();
  await activatePage(tab);
  const watcher = createDownloadWatcher({
    timeout: parsed.timeout,
    startedAfter: Date.now(),
    activeUrl: tab.url,
  });
  const click = await clickCommand([parsed.target]);
  if ("error" in click) {
    watcher.cancel();
    return click;
  }
  return watcher.promise;
}

async function uploadCommand(args: string[], params: Record<string, any>) {
  const target = args[0];
  if (!target) return { error: { code: "InvalidArgumentError", message: "upload requires <target> <files...>" } };
  const files = await uploadFilesFromParams(params.uploadFiles, params.uploadFilesRef);
  if ("error" in files) return files;
  const locator = locatorFromTarget(target);
  if ("error" in locator) return locator;
  const tab = await targetTab();
  const response = await sendFrame(
    tab.tabId,
    locator.frameId,
    { type: "upload_files", locator: locator.locator, files: files.files },
    { staleOnFrameRoutingError: true }
  );
  return normalizeContentResponse(response);
}

async function uploadFilesFromParams(
  value: unknown,
  refValue?: unknown
): Promise<{ files: UploadFilePayload[] } | { error: Record<string, unknown> }> {
  if (refValue) {
    return uploadFilesFromRef(refValue);
  }
  if (!Array.isArray(value) || value.length === 0) {
    return { error: { code: "InvalidArgumentError", message: "upload requires file payloads from the pire-browser CLI" } };
  }
  const files: UploadFilePayload[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { error: { code: "InvalidArgumentError", message: "upload file payload is malformed" } };
    }
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.name !== "string" || typeof candidate.bytesBase64 !== "string" || typeof candidate.size !== "number") {
      return { error: { code: "InvalidArgumentError", message: "upload file payload is missing name, size, or bytes" } };
    }
    files.push({
      name: candidate.name,
      mimeType: typeof candidate.mimeType === "string" ? candidate.mimeType : "application/octet-stream",
      size: candidate.size,
      sha256: typeof candidate.sha256 === "string" ? candidate.sha256 : undefined,
      bytesBase64: candidate.bytesBase64,
    });
  }
  return { files };
}

async function uploadFilesFromRef(value: unknown): Promise<{ files: UploadFilePayload[] } | { error: Record<string, unknown> }> {
  const uploadRef = parseUploadFilesRef(value);
  if ("error" in uploadRef) return uploadRef;
  const files: UploadFilePayload[] = [];
  for (let fileIndex = 0; fileIndex < uploadRef.ref.files.length; fileIndex++) {
    const file = uploadRef.ref.files[fileIndex];
    let bytesBase64 = "";
    for (let chunkIndex = 0; chunkIndex < file.chunks; chunkIndex++) {
      let chunk: UploadChunkResponse;
      try {
        chunk = await requestUploadChunk(uploadRef.ref.transferId, fileIndex, chunkIndex);
      } catch (error) {
        return {
          error: {
            code: "upload_chunk_failed",
            message: `Failed to read upload chunk for ${file.name}: ${error instanceof Error ? error.message : String(error)}`,
          },
        };
      }
      if (chunk.total !== file.chunks) {
        return {
          error: {
            code: "upload_chunk_failed",
            message: `Upload chunk count changed for ${file.name}: expected ${file.chunks}, got ${chunk.total}`,
          },
        };
      }
      bytesBase64 += chunk.data;
    }
    files.push({
      name: file.name,
      mimeType: file.mimeType ?? "application/octet-stream",
      size: file.size,
      sha256: file.sha256,
      bytesBase64,
    });
  }
  return { files };
}

function parseUploadFilesRef(value: unknown): { ref: UploadFilesRef } | { error: Record<string, unknown> } {
  if (!value || typeof value !== "object") {
    return { error: { code: "InvalidArgumentError", message: "upload file reference is malformed" } };
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.transferId !== "string" || !Array.isArray(candidate.files)) {
    return { error: { code: "InvalidArgumentError", message: "upload file reference is missing transfer metadata" } };
  }
  const files: UploadFilesRef["files"] = [];
  for (const item of candidate.files) {
    if (!item || typeof item !== "object") {
      return { error: { code: "InvalidArgumentError", message: "upload file metadata is malformed" } };
    }
    const file = item as Record<string, unknown>;
    if (typeof file.name !== "string" || typeof file.size !== "number" || typeof file.chunks !== "number") {
      return { error: { code: "InvalidArgumentError", message: "upload file metadata is missing name, size, or chunks" } };
    }
    files.push({
      name: file.name,
      mimeType: typeof file.mimeType === "string" ? file.mimeType : "application/octet-stream",
      size: file.size,
      sha256: typeof file.sha256 === "string" ? file.sha256 : undefined,
      chunks: file.chunks,
    });
  }
  return { ref: { transferId: candidate.transferId, files } };
}

function requestUploadChunk(transferId: string, fileIndex: number, chunkIndex: number): Promise<UploadChunkResponse> {
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingUploadChunks.delete(requestId);
      reject(new Error("timed out waiting for native upload chunk"));
    }, UPLOAD_CHUNK_TIMEOUT_MS);
    pendingUploadChunks.set(requestId, { resolve, reject, timer });
    postNative({
      type: "upload_chunk_request",
      request_id: requestId,
      transfer_id: transferId,
      file_index: fileIndex,
      chunk_index: chunkIndex,
    });
  });
}

async function waitDownloadCommand(args: string[]) {
  const timeoutResult = parseTimeoutOption(args, DOWNLOAD_TIMEOUT_MS);
  if ("error" in timeoutResult) return timeoutResult;
  const tab = await targetTab().catch(() => undefined);
  if (tab) await activatePage(tab);
  const watcher = createDownloadWatcher({
    timeout: timeoutResult.ms,
    startedAfter: Date.now() - DOWNLOAD_RECENT_MS,
    activeUrl: tab?.url,
  });
  return watcher.promise;
}

function parseDownloadCommand(args: string[]): { target: string; timeout: number } | { error: Record<string, unknown> } {
  const timeoutResult = parseTimeoutOption(args, DOWNLOAD_TIMEOUT_MS);
  if (timeoutResult.error) return { error: timeoutResult.error };
  const target = firstPositionalArg(args, ["--timeout"]);
  if (!target) {
    return { error: { code: "invalid_args", message: "download requires <target> <path>" } };
  }
  return { target, timeout: timeoutResult.ms };
}

function createDownloadWatcher(options: {
  timeout: number;
  startedAfter: number;
  activeUrl?: string;
}): { promise: Promise<Record<string, unknown>>; cancel: () => void } {
  let settled = false;
  let timeoutTimer = 0;
  let pollTimer = 0;
  let wakeTimer = 0;
  let cleanupWatcher = () => {};
  const activeOrigin = safeOrigin(options.activeUrl);
  const createdDownloadIds = new Set<number>();

  const promise = new Promise<Record<string, unknown>>((resolve) => {
    const cleanup = () => {
      clearTimeout(timeoutTimer);
      clearInterval(pollTimer);
      clearTimeout(wakeTimer);
      browser.downloads?.onChanged?.removeListener?.(listener);
      browser.downloads?.onCreated?.removeListener?.(createdListener);
    };
    cleanupWatcher = cleanup;
    const settle = (result: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const check = async () => {
      const match = await newestEligibleDownload(options.startedAfter, activeOrigin, createdDownloadIds).catch((error: unknown) => ({
        error: {
          code: "DownloadError",
          message: `Failed to inspect Firefox downloads: ${error instanceof Error ? error.message : String(error)}`,
        },
      }));
      if ("error" in match) {
        settle(match);
        return;
      }
      if (!match.item) return;
      if (match.item.state === "complete") {
        settle(downloadResult(match.item));
      } else if (match.item.state === "interrupted") {
        settle({
          error: {
            code: "DownloadError",
            message: `Firefox download ${match.item.id} was interrupted`,
          },
        });
      }
    };
    const wake = () => {
      clearTimeout(wakeTimer);
      wakeTimer = setTimeout(() => void check(), 50);
    };
    const listener = () => wake();
    const createdListener = (item: any) => {
      if (typeof item?.id === "number") createdDownloadIds.add(item.id);
      wake();
    };

    if (!browser.downloads?.search) {
      settle(notAvailable("download", "Firefox did not expose the downloads API to the extension context."));
      return;
    }
    browser.downloads.onChanged?.addListener?.(listener);
    browser.downloads.onCreated?.addListener?.(createdListener);
    pollTimer = setInterval(() => void check(), DOWNLOAD_POLL_INTERVAL_MS);
    timeoutTimer = setTimeout(
      () => settle({ error: { code: "TimeoutError", message: `Timed out waiting for Firefox download after ${options.timeout}ms` } }),
      options.timeout
    );
    void check();
  });

  return {
    promise,
    cancel: () => {
      if (settled) return;
      settled = true;
      cleanupWatcher();
    },
  };
}

async function newestEligibleDownload(
  startedAfter: number,
  activeOrigin: string | undefined,
  createdDownloadIds: Set<number>
): Promise<{ item?: any } | { error: Record<string, unknown> }> {
  const downloads = await browser.downloads.search({});
  const eligible = downloads
    .filter((item: any) => typeof item.id === "number" && typeof item.filename === "string" && item.filename.length > 0)
    .filter((item: any) => downloadStartMs(item) >= startedAfter || createdDownloadIds.has(item.id))
    .filter((item: any) => ["in_progress", "complete", "interrupted"].includes(item.state));
  eligible.sort((left: any, right: any) => downloadScore(right, activeOrigin) - downloadScore(left, activeOrigin));
  return { item: eligible[0] };
}

function downloadResult(item: any) {
  const bytes = typeof item.fileSize === "number" && item.fileSize >= 0
    ? item.fileSize
    : typeof item.totalBytes === "number" && item.totalBytes >= 0
      ? item.totalBytes
      : 0;
  return {
    text: `Firefox download ${item.id} completed`,
    stagedPath: item.filename,
    bytes,
    state: item.state ?? "complete",
    downloadId: item.id,
    url: item.url,
    displayUrl: typeof item.url === "string" ? displayUrlWithoutQueryOrFragment(item.url) : undefined,
  };
}

function downloadScore(item: any, activeOrigin?: string) {
  const referrerOrigin = safeOrigin(item.referrer);
  const sourceOrigin = safeOrigin(item.url);
  const originBonus = activeOrigin && (referrerOrigin === activeOrigin || sourceOrigin === activeOrigin) ? 10_000_000_000_000 : 0;
  return originBonus + downloadStartMs(item);
}

function downloadStartMs(item: any) {
  const parsed = Date.parse(item.startTime ?? "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeOrigin(url?: string) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
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
    const frames = await findInTab(tab.tabId, locator.locator, targetFrameIdForTab(tab.tabId, locator.frameId));
    const count = frames.reduce((sum, frame) => sum + frame.elements.length, 0);
    return { text: String(count), value: count };
  }
  if (!target) return { error: { code: "InvalidArgumentError", message: "get requires <property> <selector>" } };
  const locator = locatorFromTarget(target);
  if ("error" in locator) return locator;
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, targetFrameIdForTab(tab.tabId, locator.frameId), { type: "get", locator: locator.locator, property, attribute }, { staleOnFrameRoutingError: true });
  return normalizeContentResponse(response);
}

async function isCommand(args: string[]) {
  const [state, target] = args;
  if (!state || !target) return { error: { code: "InvalidArgumentError", message: "is requires visible|enabled|checked <selector>" } };
  const locator = locatorFromTarget(target);
  if ("error" in locator) return locator;
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, targetFrameIdForTab(tab.tabId, locator.frameId), { type: "is", locator: locator.locator, state }, { staleOnFrameRoutingError: true });
  return normalizeContentResponse(response);
}

async function evalCommand(args: string[]) {
  const parsed = parseEvalScript(args);
  if ("error" in parsed) return parsed;
  const { script } = parsed;
  if (!script) return { error: { code: "InvalidArgumentError", message: "eval requires <js>" } };
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, undefined, { type: "eval", script });
  return normalizeContentResponse(response);
}

function parseEvalScript(args: string[]): { script: string } | { error: RpcResponse["error"] } {
  if (args[0] === "-b" || args[0] === "--base64") {
    if (args.length !== 2 || !args[1]) {
      return { error: { code: "invalid_args", message: "eval -b requires exactly one base64 value" } };
    }
    return decodeEvalBase64(args[1]);
  }
  const inlineBase64 = args[0]?.startsWith("--base64=") ? args[0].slice("--base64=".length) : undefined;
  if (inlineBase64 !== undefined) {
    if (args.length !== 1 || !inlineBase64) {
      return { error: { code: "invalid_args", message: "eval --base64=<value> requires exactly one base64 value" } };
    }
    return decodeEvalBase64(inlineBase64);
  }
  if (args.includes("--stdin")) {
    return { error: { code: "invalid_args", message: "eval --stdin is handled by the CLI; pipe stdin to `pire-browser eval --stdin`." } };
  }
  return { script: args.join(" ") };
}

function decodeEvalBase64(value: string): { script: string } | { error: RpcResponse["error"] } {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return { script: new TextDecoder().decode(bytes) };
  } catch (error) {
    return {
      error: {
        code: "invalid_args",
        message: `eval base64 input is invalid: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

async function setContentCommand(args: string[]) {
  const html = args.join(" ");
  if (!html) return { error: { code: "invalid_args", message: "setcontent requires <html>" } };
  const tab = await targetTab();
  let response: unknown;
  try {
    response = await sendFrame(tab.tabId, 0, { type: "setcontent", html });
  } catch (error) {
    if (!isFrameRoutingError(error)) throw error;
    await injectContentScriptIntoTab(tab.tabId);
    response = await sendFrame(tab.tabId, 0, { type: "setcontent", html });
  }
  const result = normalizeContentResponse(response);
  if (!("error" in result)) {
    const current = await browser.tabs.get(tab.tabId).catch(() => null);
    if (current) rememberTab(current);
  }
  return result;
}

async function injectContentScriptIntoTab(tabId: number) {
  if (typeof browser.tabs?.executeScript !== "function") {
    throw new Error("setcontent requires Firefox tabs.executeScript support when no content script is connected.");
  }
  await browser.tabs.executeScript(tabId, {
    file: "dist/content.js",
    allFrames: false,
    matchAboutBlank: true,
  });
}

async function pushStateCommand(args: string[], domainPolicy: DomainPolicyContext | null) {
  const target = firstPositionalArg(args, []);
  if (!target) return { error: { code: "invalid_args", message: "pushstate requires <url>" } };
  const tab = await targetTab();
  const resolved = resolveNavigationUrl(target, tab.url);
  if ("error" in resolved) return resolved;
  if (domainPolicy?.enabled) {
    const domainError = domainPolicyErrorForUrl(resolved.url, domainPolicy);
    if (domainError) return { error: domainError };
  }
  const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "pushstate", url: target });
  const result = normalizeContentResponse(response);
  if (!("error" in result)) {
    const current = await browser.tabs.get(tab.tabId).catch(() => null);
    if (current) rememberTab(current);
  }
  return result;
}

function resolveNavigationUrl(input: string, baseUrl?: string) {
  const base = baseUrl && !baseUrl.startsWith("about:") ? baseUrl : undefined;
  try {
    const url = new URL(input, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: { code: "invalid_args", message: `${url.protocol.replace(":", "")}: URLs are not supported by pushstate` } };
    }
    return { url: url.href };
  } catch {
    return { error: { code: "invalid_args", message: `Invalid pushstate URL: ${input}` } };
  }
}

async function screenshotCommand(args: string[], params: Record<string, any> = {}) {
  const dir = valueAfter(args, "--screenshot-dir");
  const format = valueAfter(args, "--screenshot-format") === "jpeg" ? "jpeg" : "png";
  const quality = Number(valueAfter(args, "--screenshot-quality") ?? "92");
  const positional = firstPositionalArg(args, ["--screenshot-dir", "--screenshot-format", "--screenshot-quality", "--hide-scrollbars"]);
  const generatedName = `pire-browser-screenshot-${Date.now()}.${format === "jpeg" ? "jpg" : "png"}`;
  const defaultScreenshotPath = !dir && !positional;
  const path = screenshotPathFor(dir, positional, generatedName);
  const annotate = args.includes("--annotate");
  const full = args.includes("--full");
  const hideScrollbars = screenshotHideScrollbars(args, params);
  const tab = await targetTab();
  await activatePage(tab);
  let annotationResult: Record<string, any> | null = null;
  const annotationFrameId = selectedFrameIdForTab(tab.tabId);
  let scrollbarsHidden = false;
  let meta: Record<string, unknown>;
  let fullPage: Record<string, unknown> | undefined;
  try {
    if (hideScrollbars) {
      await setScreenshotScrollbarsHidden(tab.tabId, true);
      scrollbarsHidden = true;
      await delay(50);
    }
    if (annotate) {
      const response = await sendFrame(tab.tabId, annotationFrameId, { type: "screenshot_annotate", fullPage: full });
      const result = normalizeContentResponse(response);
      if ("error" in result) return result;
      annotationResult = addScreenshotAnnotationRefs(result as Record<string, any>, tab.tabId, annotationFrameId ?? 0);
      await delay(50);
    }
    const capture = full
      ? await captureFullPageScreenshot(tab, format, quality)
      : { dataUrl: await browser.tabs.captureVisibleTab(tab.windowId, { format, quality }), fullPage: undefined };
    fullPage = capture.fullPage;
    const dataUrl = capture.dataUrl;
    meta = await sendScreenshotChunks(dataUrl);
  } finally {
    if (scrollbarsHidden) {
      await setScreenshotScrollbarsHidden(tab.tabId, false).catch(() => undefined);
    }
    if (annotate) {
      await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), { type: "screenshot_clear_annotations" }).catch(() => undefined);
    }
  }
  return {
    text: screenshotResultText(path, annotationResult),
    screenshot: meta,
    screenshotPath: path,
    screenshotDefaultPath: defaultScreenshotPath || undefined,
    fullPage,
    annotated: annotate ? annotationResult?.annotated ?? 0 : undefined,
    annotations: annotate ? annotationResult?.annotations ?? [] : undefined,
    hideScrollbars,
    warnings: mergeWarnings(annotationResult?.warnings),
  };
}

function screenshotHideScrollbars(args: string[], params: Record<string, any>) {
  let hide = params.hideScrollbars !== false;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--hide-scrollbars") {
      const parsed = parseOptionalBooleanFlag(args[index + 1]);
      if (typeof parsed === "boolean") {
        hide = parsed;
        index += 1;
      } else {
        hide = true;
      }
      continue;
    }
    if (arg.startsWith("--hide-scrollbars=")) {
      const parsed = parseOptionalBooleanFlag(arg.slice("--hide-scrollbars=".length));
      if (typeof parsed === "boolean") hide = parsed;
    }
  }
  return hide;
}

function parseOptionalBooleanFlag(value: unknown): boolean | undefined {
  if (typeof value !== "string") return undefined;
  switch (value.trim().toLowerCase()) {
    case "true":
    case "1":
    case "yes":
    case "on":
      return true;
    case "false":
    case "0":
    case "no":
    case "off":
      return false;
    default:
      return undefined;
  }
}

async function setScreenshotScrollbarsHidden(tabId: number, hidden: boolean) {
  const frames = await framesForScope(tabId);
  await Promise.all(
    frames.map((frame) =>
      sendFrame(tabId, frame.frameId, { type: "screenshot_scrollbars", hidden }).catch(() => undefined)
    )
  );
}

function addScreenshotAnnotationRefs(result: Record<string, any>, tabId: number, frameId: number) {
  const annotations = Array.isArray(result.annotations) ? result.annotations : [];
  if (!annotations.length) return result;
  refs.clear();
  let refNumber = 1;
  const withRefs = annotations.map((annotation) => {
    if (!isScreenshotAnnotation(annotation) || !isLocator(annotation.locator)) return annotation;
    const ref = `@e${refNumber++}`;
    const summary = screenshotAnnotationSummary(annotation);
    refs.set(ref, { tabId, frameId, locator: annotation.locator, summary });
    return { ...annotation, ref };
  });
  return { ...result, annotations: withRefs };
}

function screenshotResultText(path: string, annotationResult: Record<string, any> | null) {
  const base = `Screenshot captured for ${path}`;
  if (!annotationResult) return base;
  const annotations = Array.isArray(annotationResult.annotations) ? annotationResult.annotations.filter(isScreenshotAnnotation) : [];
  const annotated = Number(annotationResult.annotated ?? annotations.length);
  const lines = [base, `Annotated ${Number.isFinite(annotated) ? annotated : annotations.length} element(s).`];
  if (annotations.length) {
    lines.push("Annotation refs:");
    for (const annotation of annotations.slice(0, 24)) {
      const label = annotation.label ? `[${annotation.label}] ` : "";
      const ref = annotation.ref ? `${annotation.ref} ` : "";
      lines.push(`  ${label}${ref}${screenshotAnnotationSummary(annotation)}`.trimEnd());
    }
    if (annotations.length > 24) lines.push(`  ... ${annotations.length - 24} more annotation(s)`);
    lines.push("Use these @e refs for follow-up click/fill/get commands.");
  }
  return lines.join("\n");
}

function isScreenshotAnnotation(value: unknown): value is ScreenshotAnnotation {
  return Boolean(value && typeof value === "object");
}

function isLocator(value: unknown): value is Locator {
  return Boolean(value && typeof value === "object" && typeof (value as Record<string, unknown>).kind === "string");
}

function screenshotAnnotationSummary(annotation: ScreenshotAnnotation) {
  const role = annotation.role || "element";
  const name = annotation.name ? ` "${truncate(annotation.name, 80)}"` : "";
  return `${role}${name}`;
}

function screenshotPathFor(dir: string | undefined, positional: string | undefined, generatedName: string) {
  if (dir) {
    const cleanDir = dir.replace(/[\\/]$/, "");
    const name = positional && !/[\\/]/.test(positional) ? positional : positional ? undefined : generatedName;
    if (name) return `${cleanDir}/${name}`;
  }
  return positional ?? generatedName;
}

type FullPageMetrics = {
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
  maxScrollX: number;
  maxScrollY: number;
  scrollX: number;
  scrollY: number;
};

type LoadedCaptureImage = {
  image: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
};

async function captureFullPageScreenshot(tab: TabRecord, format: "png" | "jpeg", quality: number) {
  const frameId = selectedFrameIdForTab(tab.tabId);
  const metricsResponse = await sendFrame(tab.tabId, frameId, { type: "screenshot_full_metrics" });
  const metricsResult = normalizeContentResponse(metricsResponse);
  if ("error" in metricsResult) throw new Error(String(metricsResult.error?.message ?? "failed to read page metrics"));
  const metrics = fullPageMetricsFromResult(metricsResult);
  const originalX = metrics.scrollX;
  const originalY = metrics.scrollY;
  const xs = tilePositions(metrics.documentWidth, metrics.viewportWidth, metrics.maxScrollX);
  const ys = tilePositions(metrics.documentHeight, metrics.viewportHeight, metrics.maxScrollY);
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("failed to create screenshot canvas");

  let scaleX = 1;
  let scaleY = 1;
  let initialized = false;
  let tileCount = 0;

  try {
    for (const y of ys) {
      for (const x of xs) {
        const scrollResponse = await sendFrame(tab.tabId, frameId, { type: "screenshot_scroll", x, y });
        const scrollResult = normalizeContentResponse(scrollResponse);
        if ("error" in scrollResult) throw new Error(String(scrollResult.error?.message ?? "failed to scroll page"));
        await delay(80);
        const actualX = Math.max(0, Number((scrollResult as any).scrollX ?? x));
        const actualY = Math.max(0, Number((scrollResult as any).scrollY ?? y));
        const dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format, quality });
        const loaded = await loadCaptureImage(dataUrl);
        try {
          if (!initialized) {
            scaleX = loaded.width / metrics.viewportWidth;
            scaleY = loaded.height / metrics.viewportHeight;
            canvas.width = Math.max(1, Math.ceil(metrics.documentWidth * scaleX));
            canvas.height = Math.max(1, Math.ceil(metrics.documentHeight * scaleY));
            context.fillStyle = "#ffffff";
            context.fillRect(0, 0, canvas.width, canvas.height);
            initialized = true;
          }
          const destinationX = Math.round(actualX * scaleX);
          const destinationY = Math.round(actualY * scaleY);
          const sourceWidth = Math.min(loaded.width, Math.ceil((metrics.documentWidth - actualX) * scaleX));
          const sourceHeight = Math.min(loaded.height, Math.ceil((metrics.documentHeight - actualY) * scaleY));
          if (sourceWidth > 0 && sourceHeight > 0) {
            context.drawImage(
              loaded.image,
              0,
              0,
              sourceWidth,
              sourceHeight,
              destinationX,
              destinationY,
              sourceWidth,
              sourceHeight
            );
            tileCount += 1;
          }
        } finally {
          loaded.close?.();
        }
      }
    }
  } finally {
    await sendFrame(tab.tabId, frameId, { type: "screenshot_scroll", x: originalX, y: originalY }).catch(() => undefined);
  }

  const mimeType = format === "jpeg" ? "image/jpeg" : "image/png";
  const dataUrl = canvas.toDataURL(mimeType, Math.max(0, Math.min(1, quality / 100)));
  return {
    dataUrl,
    fullPage: {
      width: canvas.width,
      height: canvas.height,
      cssWidth: metrics.documentWidth,
      cssHeight: metrics.documentHeight,
      viewportWidth: metrics.viewportWidth,
      viewportHeight: metrics.viewportHeight,
      tiles: tileCount,
    },
  };
}

function fullPageMetricsFromResult(result: Record<string, unknown>): FullPageMetrics {
  const viewportWidth = positiveNumber(result.viewportWidth, "viewportWidth");
  const viewportHeight = positiveNumber(result.viewportHeight, "viewportHeight");
  const documentWidth = positiveNumber(result.documentWidth, "documentWidth");
  const documentHeight = positiveNumber(result.documentHeight, "documentHeight");
  return {
    viewportWidth,
    viewportHeight,
    documentWidth,
    documentHeight,
    maxScrollX: Math.max(0, Number(result.maxScrollX ?? Math.max(0, documentWidth - viewportWidth))),
    maxScrollY: Math.max(0, Number(result.maxScrollY ?? Math.max(0, documentHeight - viewportHeight))),
    scrollX: Math.max(0, Number(result.scrollX ?? 0)),
    scrollY: Math.max(0, Number(result.scrollY ?? 0)),
  };
}

function positiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`invalid full-page screenshot metric: ${label}`);
  return number;
}

function tilePositions(total: number, viewport: number, maxScroll: number) {
  if (total <= viewport || maxScroll <= 0) return [0];
  const positions: number[] = [];
  for (let position = 0; position < maxScroll; position += viewport) {
    positions.push(position);
  }
  positions.push(maxScroll);
  return [...new Set(positions.map((position) => Math.max(0, Math.round(position))))];
}

async function loadCaptureImage(dataUrl: string): Promise<LoadedCaptureImage> {
  if (typeof createImageBitmap === "function") {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    return {
      image: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }

  const image = await loadHtmlImage(dataUrl);
  return {
    image,
    width: image.naturalWidth,
    height: image.naturalHeight,
  };
}

function loadHtmlImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("failed to decode screenshot tile"));
    image.src = dataUrl;
  });
}

async function setCommand(args: string[]) {
  const [subcommand, ...rest] = args;
  if (subcommand === "headers") return setHeadersCommand(rest);
  if (subcommand === "media") return setMediaCommand(rest);
  if (subcommand === "device") return setDeviceCommand(rest, "set device");
  if (subcommand === "offline") return setOfflineCommand(rest);
  if (subcommand === "credentials") return setCredentialsCommand(rest);
  if (subcommand === "geo") return setGeolocationCommand(rest);
  if (subcommand !== "viewport") {
    return notAvailable(
      `set ${subcommand || ""}`.trim(),
      "Only `set viewport <w> <h> [scale]`, `set device <name>`, `set geo <lat> <lng>`, `set headers <json>`, `set credentials <username> <password>`, `set media dark|light|auto`, and `set offline on|off` are implemented on the Firefox WebExtension backend."
    );
  }
  const parsed = parseViewportArgs(rest);
  if ("error" in parsed) return parsed;

  const resized = await resizeViewport(parsed.width, parsed.height, parsed.scale, "set viewport");
  const page = resized.viewport.page;
  return {
    text: `Viewport resize requested ${parsed.width}x${parsed.height}${parsed.scale ? ` scale ${parsed.scale}` : ""}; measured ${page?.innerWidth ?? "unknown"}x${page?.innerHeight ?? "unknown"}`,
    viewport: resized.viewport,
    warnings: resized.warnings,
  };
}

async function setDeviceCommand(args: string[], commandName = "set device") {
  const parsed = parseDeviceArgs(args, commandName);
  if ("error" in parsed) return parsed;
  const resized = await resizeViewport(parsed.profile.width, parsed.profile.height, parsed.profile.scale, commandName);
  const page = resized.viewport.page;
  return {
    text: `Device ${parsed.profile.name} requested ${parsed.profile.width}x${parsed.profile.height} scale ${parsed.profile.scale}; measured ${page?.innerWidth ?? "unknown"}x${page?.innerHeight ?? "unknown"}`,
    device: {
      name: parsed.profile.name,
      viewport: {
        width: parsed.profile.width,
        height: parsed.profile.height,
        scale: parsed.profile.scale,
      },
      userAgent: parsed.profile.userAgent,
      isMobile: parsed.profile.isMobile,
      hasTouch: parsed.profile.hasTouch,
      emulated: {
        viewport: true,
        deviceScaleFactor: false,
        userAgent: false,
        touch: false,
      },
    },
    viewport: resized.viewport,
    warnings: mergeWarnings(
      resized.warnings,
      bestEffortWarning(
        commandName,
        "Firefox WebExtensions approximate device emulation by resizing the content viewport only. User-Agent, touch events, mobile browser chrome, and deviceScaleFactor are reported but not enforced."
      )
    ),
  };
}

async function resizeViewport(width: number, height: number, scale: number | undefined, feature: string) {
  const tab = await targetTab();
  await activatePage(tab);
  const beforeWindow = await browser.windows.get(tab.windowId);
  const beforeMetrics = await viewportMetrics(tab.tabId).catch(() => null);
  const chromeWidth = finitePositiveNumber(beforeWindow.width) && finitePositiveNumber(beforeMetrics?.innerWidth)
    ? Number(beforeWindow.width) - Number(beforeMetrics?.innerWidth)
    : 0;
  const chromeHeight = finitePositiveNumber(beforeWindow.height) && finitePositiveNumber(beforeMetrics?.innerHeight)
    ? Number(beforeWindow.height) - Number(beforeMetrics?.innerHeight)
    : 0;
  const targetOuterWidth = Math.max(100, Math.round(width + Math.max(0, chromeWidth)));
  const targetOuterHeight = Math.max(100, Math.round(height + Math.max(0, chromeHeight)));

  await browser.windows.update(tab.windowId, { focused: true, width: targetOuterWidth, height: targetOuterHeight });
  await delay(150);
  await tuneViewportWindow(tab.tabId, tab.windowId, width, height);
  const updatedWindow = await browser.windows.get(tab.windowId);
  const page = await viewportMetrics(tab.tabId).catch(() => null);
  const warnings = [
    bestEffortWarning(
      feature,
      "Firefox WebExtensions resize the browser window to approximate the requested content viewport. Check the returned page.innerWidth/page.innerHeight before relying on pixel-perfect screenshots."
    ),
  ];
  if (scale !== undefined && scale !== 1) {
    warnings.push(
      bestEffortWarning(
        feature,
        "Firefox WebExtensions cannot set deviceScaleFactor for an existing page; the requested scale is reported but not enforced."
      )
    );
  }
  const viewport = {
    requested: { width, height, scale: scale ?? 1 },
    window: { id: updatedWindow.id, width: updatedWindow.width, height: updatedWindow.height },
    page,
  };
  return { viewport, warnings };
}

async function setMediaCommand(args: string[]) {
  const parsed = normalizeContentColorScheme(args[0]);
  if ("error" in parsed) return parsed;
  if (!parsed.scheme) {
    return { error: { code: "invalid_args", message: "set media requires dark|light|auto" } };
  }
  const applied = await applyContentColorScheme(parsed.scheme);
  if ("error" in applied) return applied;
  return {
    text: `Media color scheme set to ${parsed.scheme}`,
    media: applied.media,
  };
}

async function setOfflineCommand(args: string[]) {
  const parsed = parseOfflineMode(args);
  if ("error" in parsed) return parsed;
  offlineModeEnabled = parsed.enabled;
  return {
    text: `Offline mode ${offlineModeEnabled ? "enabled" : "disabled"}`,
    offline: {
      enabled: offlineModeEnabled,
      emulated: {
        webRequestBlocking: true,
        navigatorOnLine: false,
        serviceWorkerCache: false,
        socketState: false,
      },
    },
    warnings: [offlineModeWarning()],
  };
}

function parseOfflineMode(args: string[]): { enabled: boolean } | { error: RpcResponse["error"] } {
  if (args.length > 1) {
    return { error: { code: "invalid_args", message: "set offline accepts on|off" } };
  }
  const value = (args[0] ?? "on").toLowerCase();
  if (value === "on" || value === "true" || value === "1") return { enabled: true };
  if (value === "off" || value === "false" || value === "0") return { enabled: false };
  return { error: { code: "invalid_args", message: "set offline accepts on|off" } };
}

function offlineModeWarning() {
  return bestEffortWarning(
    "set offline",
    "Firefox WebExtensions can cancel future network requests for managed tabs, but this is not full CDP offline emulation: navigator.onLine, service worker cache behavior, DNS, and socket state are not controlled."
  );
}

async function setCredentialsCommand(args: string[]) {
  const parsed = parseBasicCredentials(args);
  if ("error" in parsed) return parsed;
  const tab = await targetTab();
  const origin = safeOrigin(tab.url);
  if (!origin) {
    return { error: { code: "InvalidArgumentError", message: "set credentials requires an active http(s) page" } };
  }
  const credential = applyCredentialsForOrigin(origin, parsed.credentials);
  return {
    text: `Set HTTP Basic credentials for ${origin} as ${credential.username}`,
    credentials: {
      origin,
      username: credential.username,
      mode: "http_basic",
      sessionOnly: true,
    },
    warnings: [credentialsWarning()],
  };
}

function parseBasicCredentials(args: string[]):
  | { credentials: BasicCredentialRule }
  | { error: RpcResponse["error"] } {
  if (args.length !== 2) {
    return { error: { code: "invalid_args", message: "set credentials requires <username> <password>" } };
  }
  const [username, password] = args;
  if (!username) {
    return { error: { code: "invalid_args", message: "set credentials username cannot be empty" } };
  }
  if (username.includes("\n") || username.includes("\r") || password.includes("\n") || password.includes("\r")) {
    return { error: { code: "invalid_args", message: "set credentials values cannot contain newlines" } };
  }
  return { credentials: { username, password } };
}

function credentialsWarning() {
  return bestEffortWarning(
    "set credentials",
    "HTTP Basic credentials are stored only in this managed Firefox extension session. They are applied to matching active-origin requests and auth challenges, but they are not an encrypted credential vault."
  );
}

async function setGeolocationCommand(args: string[]) {
  const parsed = parseGeolocationArgs(args);
  if ("error" in parsed) return parsed;
  const script = geolocationShimScript(parsed.geo);
  const warnings = [geolocationWarning()];
  const registration = await registerGeolocationShim(script);
  if ("error" in registration) return registration;
  const activeInjection = await injectGeolocationShimIntoActivePage(script);
  return {
    text: `Geolocation set to ${parsed.geo.latitude}, ${parsed.geo.longitude}`,
    geolocation: {
      latitude: parsed.geo.latitude,
      longitude: parsed.geo.longitude,
      accuracy: parsed.geo.accuracy,
      emulated: {
        pageNavigatorGeolocation: true,
        browserPermissionPrompt: false,
        operatingSystemLocation: false,
      },
      registeredForFutureNavigations: registration.registered,
      activeFrameInjections: activeInjection.count,
    },
    warnings: mergeWarnings(warnings, registration.warnings, activeInjection.warnings),
  };
}

function parseGeolocationArgs(args: string[]): { geo: GeolocationState } | { error: RpcResponse["error"] } {
  if (args.length !== 2) {
    return { error: { code: "invalid_args", message: "set geo requires <lat> <lng>" } };
  }
  const latitude = Number(args[0]);
  const longitude = Number(args[1]);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { error: { code: "invalid_args", message: "set geo latitude must be a number from -90 to 90" } };
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { error: { code: "invalid_args", message: "set geo longitude must be a number from -180 to 180" } };
  }
  return { geo: { latitude, longitude, accuracy: 25 } };
}

async function registerGeolocationShim(script: string) {
  if (typeof browser.contentScripts?.register !== "function") {
    return {
      error: {
        code: "not_available",
        message: "set geo requires Firefox contentScripts.register support.",
      },
    };
  }
  if (geolocationInitScriptRegistration) {
    await unregisterInitScripts([geolocationInitScriptRegistration]);
    geolocationInitScriptRegistration = null;
  }
  geolocationInitScriptRegistration = await browser.contentScripts.register({
    matches: ["<all_urls>"],
    js: [{ code: initScriptContentScript({ path: "set-geo", code: script }) }],
    runAt: "document_start",
    allFrames: true,
    matchAboutBlank: true,
  });
  return { registered: true, warnings: [] };
}

async function injectGeolocationShimIntoActivePage(script: string) {
  const tab = await targetTab().catch(() => null);
  if (!tab || typeof browser.tabs?.executeScript !== "function") {
    return {
      count: 0,
      warnings: [
        bestEffortWarning(
          "set geo",
          "Registered geolocation for future navigations, but could not inject it into the currently active page."
        ),
      ],
    };
  }
  try {
    const results = await browser.tabs.executeScript(tab.tabId, {
      code: initScriptContentScript({ path: "set-geo-runtime", code: script }),
      allFrames: true,
      matchAboutBlank: true,
    });
    return { count: Array.isArray(results) ? results.length : 0, warnings: [] };
  } catch (error) {
    return {
      count: 0,
      warnings: [
        bestEffortWarning(
          "set geo",
          `Registered geolocation for future navigations, but active-page injection failed: ${error instanceof Error ? error.message : String(error)}`
        ),
      ],
    };
  }
}

function geolocationWarning() {
  return bestEffortWarning(
    "set geo",
    "Geolocation is emulated with a page-level navigator.geolocation shim for managed Firefox pages. It does not change Firefox's native permission prompt, OS location services, IP-based location, or browser chrome state."
  );
}

function geolocationShimScript(geo: GeolocationState) {
  const payload = JSON.stringify(geo);
  return `(() => {
  const geo = ${payload};
  const makePosition = () => ({
    coords: {
      latitude: geo.latitude,
      longitude: geo.longitude,
      accuracy: geo.accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  });
  const previous = window.__pireBrowserGeolocation;
  if (previous && previous.timers) {
    for (const timer of previous.timers.values()) clearInterval(timer);
  }
  const state = { timers: new Map(), nextWatchId: 1 };
  window.__pireBrowserGeolocation = state;
  const api = {
    getCurrentPosition(success, error, options) {
      if (typeof success === "function") setTimeout(() => success(makePosition()), 0);
    },
    watchPosition(success, error, options) {
      const id = state.nextWatchId++;
      const emit = () => {
        if (typeof success === "function") success(makePosition());
      };
      state.timers.set(id, setInterval(emit, 1000));
      setTimeout(emit, 0);
      return id;
    },
    clearWatch(id) {
      const timer = state.timers.get(id);
      if (timer) clearInterval(timer);
      state.timers.delete(id);
    },
  };
  try {
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      enumerable: true,
      value: api,
    });
  } catch {
    try { navigator.geolocation = api; } catch {}
  }
  try {
    if (navigator.permissions && typeof navigator.permissions.query === "function") {
      const originalQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (descriptor) => {
        if (descriptor && descriptor.name === "geolocation") {
          return Promise.resolve({
            state: "granted",
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return false; },
          });
        }
        return originalQuery(descriptor);
      };
    }
  } catch {}
})();`;
}

function normalizeContentColorScheme(value: unknown): { scheme?: ContentColorScheme } | { error: RpcResponse["error"] } {
  if (value == null || value === "") return {};
  if (typeof value !== "string") {
    return { error: { code: "invalid_args", message: "color scheme must be dark, light, or auto" } };
  }
  const scheme = value.toLowerCase();
  if (scheme === "dark" || scheme === "light" || scheme === "auto") return { scheme };
  return { error: { code: "invalid_args", message: "color scheme must be dark, light, or auto" } };
}

async function applyContentColorScheme(scheme: ContentColorScheme) {
  const setting = browser.browserSettings?.overrideContentColorScheme;
  if (!setting?.set) {
    return {
      error: {
        code: "not_available",
        message: "Firefox browserSettings.overrideContentColorScheme is unavailable in this extension context",
      },
    };
  }
  const applied = await setting.set({ value: scheme });
  return {
    media: {
      colorScheme: scheme,
      applied: applied !== false,
    },
  };
}

async function applyProxyFromParams(value: unknown):
  Promise<{ proxy?: ProxyState; warnings?: unknown[] } | { error: RpcResponse["error"] }> {
  if (value == null) return {};
  const parsed = parseProxyParam(value);
  if ("error" in parsed) return parsed;
  const setting = browser.proxy?.settings;
  if (!setting?.set) {
    return {
      error: {
        code: "not_available",
        message: "Firefox proxy.settings is unavailable in this extension context",
      },
    };
  }
  if (!parsed.enabled) {
    proxyCredentials = null;
    await setting.set({ value: { proxyType: "none" } });
    return {
      proxy: { enabled: false, source: parsed.source },
      warnings: [proxyWarning()],
    };
  }
  proxyCredentials = parsed.credentials ?? null;
  await setting.set({ value: parsed.settings });
  return {
    proxy: {
      enabled: true,
      url: parsed.redactedUrl,
      scheme: parsed.scheme,
      host: parsed.host,
      port: parsed.port,
      bypass: parsed.bypass,
      hasCredentials: Boolean(parsed.credentials),
      source: parsed.source,
    },
    warnings: [proxyWarning()],
  };
}

function parseProxyParam(value: unknown):
  | {
      enabled: false;
      source?: string;
    }
  | {
      enabled: true;
      settings: Record<string, unknown>;
      redactedUrl: string;
      scheme: string;
      host: string;
      port: string;
      bypass?: string;
      source?: string;
      credentials?: BasicCredentialRule;
    }
  | { error: RpcResponse["error"] } {
  if (!value || typeof value !== "object") {
    return { error: { code: "invalid_args", message: "proxy payload must be an object" } };
  }
  const candidate = value as Record<string, unknown>;
  const source = typeof candidate.source === "string" ? candidate.source : undefined;
  const rawUrl = typeof candidate.url === "string" ? candidate.url.trim() : "";
  const bypass = typeof candidate.bypass === "string" && candidate.bypass.trim() ? candidate.bypass.trim() : undefined;
  const explicitUsername = typeof candidate.username === "string" ? candidate.username : "";
  const explicitPassword = typeof candidate.password === "string" ? candidate.password : "";
  if (!rawUrl) {
    return { error: { code: "invalid_args", message: "--proxy requires a non-empty URL" } };
  }
  if (/^(off|none|direct)$/i.test(rawUrl)) return { enabled: false, source };
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { error: { code: "invalid_args", message: "--proxy requires a valid proxy URL" } };
  }
  const scheme = parsed.protocol.replace(":", "").toLowerCase();
  if (!["http", "https", "socks", "socks4", "socks5"].includes(scheme)) {
    return { error: { code: "invalid_args", message: "--proxy supports http, https, socks4, and socks5 URLs" } };
  }
  const host = parsed.hostname;
  if (!host) {
    return { error: { code: "invalid_args", message: "--proxy URL requires a host" } };
  }
  const port = parsed.port;
  const address = `${parsed.protocol}//${parsed.host}`;
  const credentials =
    parsed.username || parsed.password || explicitUsername || explicitPassword
      ? {
          username: parsed.username ? decodeURIComponent(parsed.username) : explicitUsername,
          password: parsed.password ? decodeURIComponent(parsed.password) : explicitPassword,
        }
      : undefined;
  const redacted = new URL(parsed.toString());
  redacted.username = "";
  redacted.password = "";
  redacted.pathname = "";
  redacted.search = "";
  redacted.hash = "";
  const settings: Record<string, unknown> = {
    proxyType: "manual",
  };
  if (bypass) settings.passthrough = bypass;
  if (scheme.startsWith("socks")) {
    settings.socks = address;
    settings.socksVersion = scheme === "socks4" ? 4 : 5;
    settings.proxyDNS = scheme !== "socks4";
  } else {
    settings.http = address;
    settings.ssl = address;
    settings.httpProxyAll = true;
  }
  return {
    enabled: true,
    settings,
    redactedUrl: redacted.toString(),
    scheme,
    host,
    port,
    bypass,
    source,
    credentials,
  };
}

function proxyWarning() {
  return bestEffortWarning(
    "proxy",
    "Firefox proxy settings are applied through browser.proxy.settings for the managed browser session. Proxy credentials are handled in memory and are not echoed in output; Firefox may still require private-window proxy permission depending on the user's extension settings."
  );
}

async function setHeadersCommand(args: string[]) {
  const jsonText = args.join(" ").trim();
  if (!jsonText) {
    return { error: { code: "InvalidArgumentError", message: "set headers requires <json>" } };
  }
  const parsed = parseHeadersOption(jsonText, "set headers");
  if ("error" in parsed) return parsed;
  const tab = await targetTab();
  const origin = safeOrigin(tab.url);
  if (!origin) {
    return { error: { code: "InvalidArgumentError", message: "set headers requires an active http(s) page" } };
  }
  const headers = applyHeadersForOrigin(origin, parsed.headers);
  return {
    text: headers.names.length
      ? `Set ${headers.names.length} header(s) for ${headers.origin}: ${headers.names.join(", ")}`
      : `Cleared headers for ${headers.origin}`,
    headers,
  };
}

function parseHeadersOption(
  value: string | undefined,
  feature: string
): { provided: boolean; headers: HeaderRule[] } | { error: RpcResponse["error"] } {
  if (value === undefined) return { provided: false, headers: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { error: { code: "InvalidArgumentError", message: `${feature} requires a JSON object of header names to values` } };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: { code: "InvalidArgumentError", message: `${feature} requires a JSON object of header names to values` } };
  }
  const headers: HeaderRule[] = [];
  for (const [name, rawValue] of Object.entries(parsed as Record<string, unknown>)) {
    const normalizedName = name.trim();
    const validName = validateHeaderName(normalizedName);
    if ("error" in validName) return validName;
    if (!["string", "number", "boolean"].includes(typeof rawValue)) {
      return { error: { code: "InvalidArgumentError", message: `${feature} header ${normalizedName} must be a string, number, or boolean` } };
    }
    const headerValue = String(rawValue);
    if (/[\r\n]/.test(headerValue)) {
      return { error: { code: "InvalidArgumentError", message: `${feature} header ${normalizedName} cannot contain newlines` } };
    }
    headers.push({ name: normalizedName, value: headerValue });
  }
  return { provided: true, headers };
}

function validateHeaderName(name: string): { ok: true } | { error: RpcResponse["error"] } {
  if (!/^[A-Za-z][A-Za-z0-9._-]*$/.test(name)) {
    return { error: { code: "InvalidArgumentError", message: `invalid header name: ${name || "(empty)"}` } };
  }
  const lower = name.toLowerCase();
  if (
    lower === "host" ||
    lower === "cookie" ||
    lower === "set-cookie" ||
    lower === "content-length" ||
    lower === "transfer-encoding" ||
    lower === "connection" ||
    lower.startsWith("sec-")
  ) {
    return { error: { code: "InvalidArgumentError", message: `header ${name} cannot be managed by pire-browser` } };
  }
  return { ok: true };
}

function setHeadersForUrl(url: string, headers: HeaderRule[]) {
  const origin = safeOrigin(url);
  if (!origin) {
    return { error: { code: "InvalidArgumentError", message: "open --headers requires an http(s) URL" } };
  }
  return { headers: applyHeadersForOrigin(origin, headers) };
}

function applyHeadersForOrigin(origin: string, headers: HeaderRule[]) {
  if (headers.length === 0) {
    headersByOrigin.delete(origin);
  } else {
    headersByOrigin.set(origin, headers);
  }
  return { origin, names: headers.map((header) => header.name) };
}

function applyCredentialsForOrigin(origin: string, credentials: BasicCredentialRule) {
  credentialsByOrigin.set(origin, credentials);
  return { origin, username: credentials.username };
}

function parseViewportArgs(args: string[]): { width: number; height: number; scale?: number } | { error: RpcResponse["error"] } {
  const width = Number(args[0]);
  const height = Number(args[1]);
  const scale = args[2] === undefined ? undefined : Number(args[2]);
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
    return { error: { code: "InvalidArgumentError", message: "set viewport requires positive integer <w> <h> [scale]" } };
  }
  if (scale !== undefined && (!Number.isFinite(scale) || scale <= 0)) {
    return { error: { code: "InvalidArgumentError", message: "set viewport scale must be a positive number" } };
  }
  return { width, height, scale };
}

function parseDeviceArgs(args: string[], commandName = "set device"): { profile: DeviceProfile } | { error: RpcResponse["error"] } {
  if (args.some((arg) => arg.startsWith("-") && arg !== "--json")) {
    return { error: { code: "InvalidArgumentError", message: `${commandName} does not support options` } };
  }
  const name = args.filter((arg) => arg !== "--json").join(" ").trim();
  if (!name) {
    return {
      error: {
        code: "InvalidArgumentError",
        message: `${commandName} requires <name>. Supported devices: ${supportedDeviceNames()}`,
      },
    };
  }
  const profile = findDeviceProfile(name);
  if (!profile) {
    return {
      error: {
        code: "InvalidArgumentError",
        message: `Unknown device "${name}". Supported devices: ${supportedDeviceNames()}`,
      },
    };
  }
  return { profile };
}

function findDeviceProfile(name: string) {
  const normalized = normalizeDeviceName(name);
  return DEVICE_PROFILES.find((profile) =>
    [profile.name, ...profile.aliases].some((alias) => normalizeDeviceName(alias) === normalized)
  );
}

function normalizeDeviceName(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function supportedDeviceNames() {
  return DEVICE_PROFILES.map((profile) => profile.name).join(", ");
}

async function tuneViewportWindow(tabId: number, windowId: number, width: number, height: number) {
  const metrics = await viewportMetrics(tabId).catch(() => null);
  if (!metrics || !finitePositiveNumber(metrics.innerWidth) || !finitePositiveNumber(metrics.innerHeight)) return;
  const deltaWidth = width - Number(metrics.innerWidth);
  const deltaHeight = height - Number(metrics.innerHeight);
  if (Math.abs(deltaWidth) <= 2 && Math.abs(deltaHeight) <= 2) return;
  const current = await browser.windows.get(windowId);
  const nextWidth = finitePositiveNumber(current.width) ? Math.max(100, Math.round(Number(current.width) + deltaWidth)) : undefined;
  const nextHeight = finitePositiveNumber(current.height) ? Math.max(100, Math.round(Number(current.height) + deltaHeight)) : undefined;
  if (nextWidth === undefined && nextHeight === undefined) return;
  await browser.windows.update(windowId, { width: nextWidth, height: nextHeight });
  await delay(100);
}

async function viewportMetrics(tabId: number): Promise<Record<string, any>> {
  return normalizeContentResponse(await sendFrame(tabId, undefined, { type: "viewport_metrics" }));
}

function finitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
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
  const target = args[0];
  const tab = await targetTab();
  if (!target) return { error: { code: "invalid_args", message: "frame requires <ref|selector|name|url> or main" } };
  if (target === "main") {
    selectedFramesByTabId.delete(tab.tabId);
    return { text: "Frame targeting reset to main", frame: { frameId: 0, main: true } };
  }

  const parentFrameId = selectedFrameIdForTab(tab.tabId) ?? 0;
  if (looksLikeFrameUrlTarget(target)) {
    return selectFrameByUrlTarget(tab.tabId, parentFrameId, target);
  }

  const locator = locatorFromTarget(target);
  if ("error" in locator) return locator;
  const targetParentFrameId = targetFrameIdForTab(tab.tabId, locator.frameId) ?? parentFrameId;
  const response = await sendFrame(
    tab.tabId,
    targetParentFrameId,
    { type: "frame_target", locator: locator.locator },
    { staleOnFrameRoutingError: true }
  );
  const targetResult = normalizeContentResponse(response);
  if ("error" in targetResult && !target.startsWith("@")) {
    const named = await selectFrameByNameTarget(tab.tabId, targetParentFrameId, target);
    if (!("error" in named)) return named;
    const byUrl = await selectFrameByUrlTarget(tab.tabId, targetParentFrameId, target);
    if (!("error" in byUrl)) return byUrl;
  }
  if ("error" in targetResult) return targetResult;

  const child = await childFrameForTarget(tab.tabId, targetParentFrameId, targetResult);
  if ("error" in child) return child;
  return selectFrameResult(tab.tabId, targetParentFrameId, child, targetResult);
}

async function selectFrameByNameTarget(tabId: number, parentFrameId: number, target: string) {
  const response = await sendFrame(
    tabId,
    parentFrameId,
    { type: "frame_target_by_name", name: target },
    { staleOnFrameRoutingError: true }
  );
  const targetResult = normalizeContentResponse(response);
  if ("error" in targetResult) return targetResult;
  const child = await childFrameForTarget(tabId, parentFrameId, targetResult);
  if ("error" in child) return child;
  return selectFrameResult(tabId, parentFrameId, child, targetResult);
}

async function selectFrameByUrlTarget(tabId: number, parentFrameId: number, target: string) {
  const child = await childFrameForUrlTarget(tabId, parentFrameId, target);
  if ("error" in child) return child;
  return selectFrameResult(tabId, parentFrameId, child, {
    text: `Frame target ${child.url ?? target}`,
    frameUrl: child.url,
  });
}

function selectFrameResult(tabId: number, parentFrameId: number, child: { frameId: number; url?: string }, targetResult: Record<string, unknown>) {
  selectedFramesByTabId.set(tabId, {
    frameId: child.frameId,
    parentFrameId,
    url: child.url,
    summary: String(targetResult.text ?? `frame ${child.frameId}`),
  });
  return {
    ...targetResult,
    text: `Frame ${child.frameId} selected`,
    frame: {
      frameId: child.frameId,
      parentFrameId,
      url: child.url,
      target: targetResult,
    },
  };
}

async function dialogCommand(args: string[]) {
  const [subcommand = "status", ...rest] = args;
  const tab = await targetTab();
  if (subcommand === "status") {
    const dialogs = await recentDialogsForStatus(tab.tabId);
    const dialog = dialogs[dialogs.length - 1] ?? null;
    return {
      text: dialog ? `${dialog.type}: ${dialog.message}` : "No dialog recorded",
      active: Boolean(dialog),
      dialog,
      dialogs,
    };
  }
  if (subcommand === "accept" || subcommand === "dismiss") {
    const text = rest.length ? rest.join(" ") : undefined;
    const response = await sendFrame(tab.tabId, selectedFrameIdForTab(tab.tabId), {
      type: "dialog_control",
      action: subcommand,
      text,
    });
    const result = normalizeContentResponse(response);
    if ("error" in result) return result;
    return result;
  }
  return { error: { code: "invalid_args", message: "dialog requires status|accept|dismiss" } };
}

async function debugLogCommand(kind: "console" | "errors", args: string[]) {
  const clear = args.includes("--clear") || args[0] === "clear";
  const unexpected = args.filter((arg) => arg !== "--clear" && arg !== "clear");
  if (unexpected.length > 0) {
    return {
      error: {
        code: "invalid_args",
        message: `${kind} supports no positional arguments; use ${kind}${kind === "console" ? " [--clear]" : " [--clear]"}`,
      },
    };
  }

  const tab = await targetTab();
  const frames = await framesForScope(tab.tabId);
  const frameResults: Record<string, unknown>[] = [];
  let lastError = "";
  for (const frame of frames) {
    try {
      const response = await sendFrame(tab.tabId, frame.frameId, { type: "debug_logs", kind, clear });
      if (response?.error) {
        lastError = response.error.message ?? String(response.error);
        continue;
      }
      frameResults.push({
        frameId: frame.frameId,
        url: frame.url,
        count: response?.count ?? 0,
        cleared: Boolean(response?.cleared),
        messages: response?.messages ?? [],
        errors: response?.errors ?? [],
      });
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  if (frameResults.length === 0 && lastError) {
    return {
      error: {
        code: "FrameUnavailable",
        message: `Could not read ${kind} records from the active page: ${lastError}`,
      },
    };
  }

  const recordKey = kind === "errors" ? "errors" : "messages";
  const records: Record<string, unknown>[] = [];
  for (const frame of frameResults) {
    const items = Array.isArray(frame[recordKey]) ? (frame[recordKey] as Record<string, unknown>[]) : [];
    for (const item of items) {
      records.push({
        ...item,
        frameId: frame.frameId,
        frameUrl: frame.url,
      });
    }
  }
  records.sort((left, right) => Number(left.at ?? 0) - Number(right.at ?? 0));
  const count = records.length;
  const noun = kind === "errors" ? "page error" : "console message";
  return {
    text: clear
      ? `Cleared ${count} ${noun}${count === 1 ? "" : "s"}`
      : formatDebugRecords(kind, records),
    [recordKey]: records,
    count,
    cleared: clear,
    frames: frameResults.map((frame) => ({
      frameId: frame.frameId,
      url: frame.url,
      count: frame.count,
    })),
  };
}

function formatDebugRecords(kind: "console" | "errors", records: Record<string, unknown>[]) {
  if (!records.length) return kind === "errors" ? "No page errors recorded" : "No console messages recorded";
  return records.map((record) => {
    if (kind === "errors") {
      const source = typeof record.source === "string" && record.source ? record.source : "";
      const line = typeof record.lineno === "number" ? `:${record.lineno}` : "";
      const column = typeof record.colno === "number" ? `:${record.colno}` : "";
      const location = source ? ` (${source}${line}${column})` : "";
      return `[${record.type ?? "error"}] ${record.message ?? ""}${location}`;
    }
    return `[${record.level ?? "log"}] ${record.text ?? ""}`;
  }).join("\n");
}

async function traceCommand(args: string[]) {
  const mode = traceMode(args);
  const commandArgs = traceCommandArgs(args, mode);
  const invalid = invalidTraceArgs(commandArgs, mode);
  if (invalid) return invalid;

  const tab = await targetTab();
  if (mode === "start") {
    const startedAt = Date.now();
    const recording: TraceRecording = {
      startedAt,
      tabId: tab.tabId,
      agentId: tab.agentId,
      url: tab.url,
      title: tab.title,
    };
    traceRecordingsByTabId.set(tab.tabId, recording);
    return {
      text: `Started trace recording in ${tab.agentId}`,
      traceRecording: traceRecordingStatus(tab, recording),
      warnings: [traceFirefoxWarning()],
    };
  }

  const recording = traceRecordingsByTabId.get(tab.tabId);
  if (mode === "status") {
    return {
      text: recording ? `Trace recording active in ${tab.agentId}` : `No trace recording active in ${tab.agentId}`,
      traceRecording: traceRecordingStatus(tab, recording),
      warnings: [traceFirefoxWarning()],
    };
  }

  if (!recording) {
    return {
      error: {
        code: "invalid_state",
        message: "No trace recording is active for the current tab. Run `trace start` before `trace stop`.",
      },
    };
  }

  const path = firstPositionalArg(commandArgs, []);
  const stoppedAt = Date.now();
  const trace = await traceBundle(tab, recording, stoppedAt);
  traceRecordingsByTabId.delete(tab.tabId);
  return {
    text: path
      ? `Prepared trace bundle with ${trace.network.count} request${trace.network.count === 1 ? "" : "s"} for ${path}`
      : JSON.stringify(trace, null, 2),
    trace,
    path,
    traceRecording: {
      active: false,
      startedAt: recording.startedAt,
      stoppedAt,
      durationMs: stoppedAt - recording.startedAt,
      tabId: tab.tabId,
      agentId: tab.agentId,
    },
    warnings: [traceFirefoxWarning()],
  };
}

function traceMode(args: string[]): "start" | "status" | "stop" {
  if (args[0] === "start") return "start";
  if (args[0] === "stop") return "stop";
  return "status";
}

function traceCommandArgs(args: string[], mode: "start" | "status" | "stop") {
  return mode === "status" && args[0] !== "status" ? args : args.slice(1);
}

function invalidTraceArgs(args: string[], mode: "start" | "status" | "stop") {
  const filtered = args.filter((arg) => arg !== "--json");
  if (mode === "start" && filtered.length > 0) {
    return { error: { code: "invalid_args", message: "trace start does not accept arguments; open a page before starting trace." } };
  }
  if (mode === "status" && filtered.length > 0) {
    return { error: { code: "invalid_args", message: "trace status does not accept arguments" } };
  }
  if (mode === "stop") {
    let positionalCount = 0;
    for (const arg of filtered) {
      if (arg.startsWith("--")) {
        return { error: { code: "invalid_args", message: `trace stop does not support argument: ${arg}` } };
      }
      positionalCount += 1;
      if (positionalCount > 1) {
        return { error: { code: "invalid_args", message: `trace stop unexpected argument: ${arg}` } };
      }
    }
  }
  return null;
}

function traceRecordingStatus(tab: TabRecord, recording: TraceRecording | undefined) {
  const now = Date.now();
  return {
    active: Boolean(recording),
    startedAt: recording?.startedAt,
    durationMs: recording ? now - recording.startedAt : undefined,
    tabId: tab.tabId,
    agentId: tab.agentId,
    url: tab.url,
    title: tab.title,
  };
}

async function traceBundle(tab: TabRecord, recording: TraceRecording, stoppedAt: number) {
  const records = networkRecordsForTab(tab.tabId)
    .filter((record) => record.startedAt >= recording.startedAt)
    .map(publicNetworkRecord);
  return {
    schemaVersion: 1,
    kind: "pire-browser-firefox-trace",
    source: "firefox-webextension",
    startedAt: recording.startedAt,
    stoppedAt,
    durationMs: stoppedAt - recording.startedAt,
    tab: {
      tabId: tab.tabId,
      agentId: tab.agentId,
      startUrl: recording.url,
      startTitle: recording.title,
      url: tab.url,
      title: tab.title,
    },
    console: await traceSection(() => debugLogCommand("console", [])),
    errors: await traceSection(() => debugLogCommand("errors", [])),
    network: {
      count: records.length,
      requests: records,
      har: networkHarForRecords(records, tab, { startedAt: recording.startedAt }),
      warning: networkHarMetadataWarning(),
    },
    vitals: await traceVitalsSection(tab),
    snapshot: await traceSection(() => snapshotCommand(["-i", "-c"])),
    screenshot: await traceSection(() => screenshotCommand([])),
    warnings: [traceFirefoxWarning()],
  };
}

async function traceSection(callback: () => Promise<Record<string, unknown>>) {
  try {
    const result = await callback();
    return "error" in result ? { error: result.error } : result;
  } catch (error) {
    return traceSectionError(error);
  }
}

async function traceVitalsSection(tab: TabRecord) {
  try {
    const response = await sendFrame(tab.tabId, 0, { type: "vitals" });
    const result = normalizeContentResponse(response);
    return "error" in result ? { error: result.error } : result;
  } catch (error) {
    return traceSectionError(error);
  }
}

function traceSectionError(error: unknown) {
  return {
    error: {
      code: "trace_section_failed",
      message: error instanceof Error ? error.message : String(error),
    },
  };
}

function traceFirefoxWarning() {
  return bestEffortWarning(
    "trace",
    "Firefox trace is a pire-browser QA evidence bundle built from WebExtension-observable console, error, network, vitals, snapshot, and screenshot data. It is not a Chrome DevTools performance trace or CPU profile."
  );
}

async function profilerCommand(args: string[]) {
  const mode = profilerMode(args);
  const commandArgs = profilerCommandArgs(args, mode);

  if (mode === "start") {
    const parsed = parseProfilerStartArgs(profilerFilteredArgs(commandArgs));
    if ("error" in parsed) return parsed;
    const tab = await targetTab();
    const recording: ProfilerRecording = {
      startedAt: Date.now(),
      tabId: tab.tabId,
      agentId: tab.agentId,
      url: tab.url,
      title: tab.title,
      categories: parsed.categories,
    };
    profilerRecordingsByTabId.set(tab.tabId, recording);
    return {
      text: `Started Firefox profiler in ${tab.agentId}`,
      profilerRecording: profilerRecordingStatus(tab, recording),
      warnings: profilerWarnings(recording),
    };
  }

  const tab = await targetTab();
  const recording = profilerRecordingsByTabId.get(tab.tabId);
  if (mode === "status") {
    const parsed = parseProfilerStatusArgs(profilerFilteredArgs(commandArgs));
    if ("error" in parsed) return parsed;
    return {
      text: recording ? `Firefox profiler active in ${tab.agentId}` : `No Firefox profiler active in ${tab.agentId}`,
      profilerRecording: profilerRecordingStatus(tab, recording),
      warnings: profilerWarnings(recording),
    };
  }

  const parsed = parseProfilerStopArgs(profilerFilteredArgs(commandArgs));
  if ("error" in parsed) return parsed;
  if (!recording) {
    return {
      error: {
        code: "invalid_state",
        message: "No profiler is active for the current tab. Run `profiler start` before `profiler stop`.",
      },
    };
  }

  const stoppedAt = Date.now();
  const profile = await profilerProfile(tab, recording, stoppedAt);
  profilerRecordingsByTabId.delete(tab.tabId);
  return {
    text: parsed.path
      ? `Prepared Firefox profiler profile with ${profile.traceEvents.length} trace event${profile.traceEvents.length === 1 ? "" : "s"} for ${parsed.path}`
      : JSON.stringify(profile, null, 2),
    profile,
    path: parsed.path,
    profilerRecording: {
      active: false,
      startedAt: recording.startedAt,
      stoppedAt,
      durationMs: stoppedAt - recording.startedAt,
      tabId: tab.tabId,
      agentId: tab.agentId,
    },
    warnings: profilerWarnings(recording),
  };
}

function profilerMode(args: string[]): "start" | "status" | "stop" {
  if (args[0] === "start") return "start";
  if (args[0] === "stop") return "stop";
  return "status";
}

function profilerCommandArgs(args: string[], mode: "start" | "status" | "stop") {
  return mode === "status" && args[0] !== "status" ? args : args.slice(1);
}

function profilerFilteredArgs(args: string[]) {
  return args.filter((arg) => arg !== "--json");
}

function parseProfilerStartArgs(args: string[]): { categories?: string } | CommandErrorResult {
  let categories: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--categories") {
      const value = args[++index];
      if (!value || value.startsWith("--")) {
        return { error: { code: "invalid_args", message: "profiler start --categories requires a comma-separated value" } };
      }
      categories = value;
      continue;
    }
    return { error: { code: "invalid_args", message: `profiler start does not support argument: ${arg}` } };
  }
  return { categories };
}

function parseProfilerStatusArgs(args: string[]): Record<string, never> | CommandErrorResult {
  if (args.length) return { error: { code: "invalid_args", message: "profiler status does not accept arguments" } };
  return {};
}

function parseProfilerStopArgs(args: string[]): { path?: string } | CommandErrorResult {
  let path: string | undefined;
  for (const arg of args) {
    if (arg.startsWith("--")) return { error: { code: "invalid_args", message: `profiler stop does not support argument: ${arg}` } };
    if (path) return { error: { code: "invalid_args", message: `profiler stop unexpected argument: ${arg}` } };
    path = arg;
  }
  return { path };
}

function profilerRecordingStatus(tab: TabRecord, recording: ProfilerRecording | undefined) {
  const now = Date.now();
  return {
    active: Boolean(recording),
    startedAt: recording?.startedAt,
    durationMs: recording ? now - recording.startedAt : undefined,
    tabId: tab.tabId,
    agentId: tab.agentId,
    url: tab.url,
    title: tab.title,
    categories: recording?.categories,
    chromeCpuProfile: false,
  };
}

async function profilerProfile(tab: TabRecord, recording: ProfilerRecording, stoppedAt: number) {
  const snapshot = await profilerSnapshotSection(tab, recording.startedAt);
  const traceEvents = Array.isArray((snapshot as any).traceEvents) ? (snapshot as any).traceEvents : [];
  return {
    schemaVersion: 1,
    kind: "pire-browser-firefox-profiler",
    source: "firefox-performance-api",
    traceFormat: "chrome-trace-event",
    startedAt: recording.startedAt,
    stoppedAt,
    durationMs: stoppedAt - recording.startedAt,
    categories: recording.categories,
    tab: {
      tabId: tab.tabId,
      agentId: tab.agentId,
      startUrl: recording.url,
      startTitle: recording.title,
      url: tab.url,
      title: tab.title,
    },
    traceEvents,
    summary: (snapshot as any).summary,
    capture: snapshot,
    metadata: {
      clockDomain: "unix-epoch-microseconds",
      source: "Firefox Performance Timeline",
      chromeCpuProfile: false,
    },
    warnings: profilerWarnings(recording),
  };
}

async function profilerSnapshotSection(tab: TabRecord, startedAt: number) {
  try {
    const response = await sendFrame(tab.tabId, 0, { type: "profiler_snapshot", startedAt });
    const result = normalizeContentResponse(response);
    return "error" in result ? { error: result.error, traceEvents: [] } : result;
  } catch (error) {
    return {
      error: {
        code: "profiler_capture_failed",
        message: error instanceof Error ? error.message : String(error),
      },
      traceEvents: [],
    };
  }
}

function profilerWarnings(recording?: ProfilerRecording) {
  return recording?.categories
    ? [
        profilerFirefoxWarning(),
        bestEffortWarning(
          "profiler",
          "Firefox profiler accepts --categories for agent-browser command-shape compatibility, but Chrome trace categories are recorded as metadata only."
        ),
      ]
    : [profilerFirefoxWarning()];
}

function profilerFirefoxWarning() {
  return bestEffortWarning(
    "profiler",
    "Firefox profiler emits Chrome Trace Event-shaped timing data from Performance Timeline entries exposed to WebExtensions. It is not a Chrome DevTools CPU profile or sampling profiler."
  );
}

async function recordCommand(args: string[]) {
  const mode = recordMode(args);
  const commandArgs = recordCommandArgs(args, mode);

  if (mode === "start") {
    const parsed = parseRecordStartArgs(recordFilteredArgs(commandArgs));
    if ("error" in parsed) return parsed;
    return startVisualRecording(parsed);
  }

  if (mode === "restart") {
    const parsed = parseRecordStartArgs(recordFilteredArgs(commandArgs));
    if ("error" in parsed) return parsed;
    const tab = await targetTab();
    const stopped = visualRecordingsByTabId.has(tab.tabId)
      ? await stopVisualRecordingCommand({
          tab,
          parsed: {},
          missingIsError: false,
        })
      : null;
    const started = await startVisualRecording(parsed);
    if ("error" in started) return started;
    return {
      ...started,
      text: stopped
        ? `${(stopped as any).text}\n${(started as any).text}`
        : `No previous recording active in ${tab.agentId}\n${(started as any).text}`,
      previousRecording: stopped ? (stopped as any).recording : undefined,
      warnings: mergeWarnings((stopped as any)?.warnings, (started as any).warnings),
    };
  }

  if (mode === "status") {
    const parsed = parseRecordStatusArgs(recordFilteredArgs(commandArgs));
    if ("error" in parsed) return parsed;
    const tab = await targetTab();
    const existing = visualRecordingsByTabId.get(tab.tabId);
    return {
      text: existing ? `Recording active in ${tab.agentId} with ${existing.frames.length} frame(s)` : `No recording active in ${tab.agentId}`,
      recording: recordingStatus(tab, existing),
      warnings: [recordFirefoxWarning()],
    };
  }

  const parsed = parseRecordStopArgs(recordFilteredArgs(commandArgs));
  if ("error" in parsed) return parsed;
  return await stopVisualRecordingCommand({ parsed, missingIsError: true }) ?? {
    error: {
      code: "invalid_state",
      message: "No recording is active for the current tab. Run `record start` before `record stop`.",
    },
  };
}

async function startVisualRecording(parsed: RecordStartArgs) {
  const opened = parsed.url ? await openCommand([parsed.url], "open") : null;
  if (opened && "error" in opened) return opened;
  const tab = await targetTab();
  const existing = visualRecordingsByTabId.get(tab.tabId);
  if (existing) clearVisualRecordingTimer(existing);
  const recording: VisualRecording = {
    startedAt: Date.now(),
    tabId: tab.tabId,
    agentId: tab.agentId,
    url: tab.url,
    title: tab.title,
    outputDir: parsed.outputDir,
    intervalMs: parsed.intervalMs,
    maxFrames: parsed.maxFrames,
    active: true,
    frames: [],
  };
  visualRecordingsByTabId.set(tab.tabId, recording);
  await captureRecordingFrame(recording);
  recording.timer = setInterval(() => void captureRecordingFrame(recording), recording.intervalMs);
  return {
    text: `Started screenshot-sequence recording in ${tab.agentId}${parsed.outputDir ? ` (output: ${parsed.outputDir})` : ""}`,
    recording: recordingStatus(tab, recording),
    open: opened ? resultSummary(opened) : undefined,
    warnings: mergeWarnings(opened ? (opened as any).warnings : undefined, [recordFirefoxWarning()]),
  };
}

async function stopVisualRecordingCommand(options: {
  parsed: RecordStopArgs;
  tab?: TabRecord;
  missingIsError: boolean;
}) {
  const tab = options.tab ?? await targetTab();
  const existing = visualRecordingsByTabId.get(tab.tabId);
  if (!existing) {
    return options.missingIsError ? {
      error: {
        code: "invalid_state",
        message: "No recording is active for the current tab. Run `record start` before `record stop`.",
      },
    } : null;
  }

  clearVisualRecordingTimer(existing);
  if (!existing.frames.length || existing.active) await captureRecordingFrame(existing);
  existing.active = false;
  existing.stoppedReason = existing.stoppedReason ?? "stopped";
  const stoppedAt = Date.now();
  const outputDir = options.parsed.outputDir ?? existing.outputDir ?? `pire-browser-recording-${stoppedAt}`;
  const frames = await materializeRecordingFrames(existing, outputDir);
  visualRecordingsByTabId.delete(tab.tabId);
  return {
    text: `Recorded ${frames.length} frame${frames.length === 1 ? "" : "s"} to ${outputDir}`,
    recording: {
      schemaVersion: 1,
      kind: "pire-browser-firefox-recording",
      source: "firefox-webextension-screenshot-sequence",
      outputDir,
      active: false,
      startedAt: existing.startedAt,
      stoppedAt,
      durationMs: stoppedAt - existing.startedAt,
      intervalMs: existing.intervalMs,
      maxFrames: existing.maxFrames,
      requestedOutputDir: existing.outputDir,
      stoppedReason: existing.stoppedReason,
      frameCount: frames.length,
      tab: {
        tabId: tab.tabId,
        agentId: tab.agentId,
        startUrl: existing.url,
        startTitle: existing.title,
        url: tab.url,
        title: tab.title,
      },
      frames,
      warnings: [recordFirefoxWarning()],
    },
    warnings: [recordFirefoxWarning()],
  };
}

function recordMode(args: string[]): "start" | "status" | "stop" | "restart" {
  if (args[0] === "start") return "start";
  if (args[0] === "stop") return "stop";
  if (args[0] === "restart") return "restart";
  return "status";
}

function recordCommandArgs(args: string[], mode: "start" | "status" | "stop" | "restart") {
  return mode === "status" && args[0] !== "status" ? args : args.slice(1);
}

function recordFilteredArgs(args: string[]) {
  return args.filter((arg) => arg !== "--json");
}

function parseRecordStatusArgs(args: string[]): Record<string, never> | CommandErrorResult {
  if (args.length) {
    return { error: { code: "invalid_args", message: "record status does not accept arguments" } };
  }
  return {};
}

function parseRecordStartArgs(args: string[]): RecordStartArgs | CommandErrorResult {
  let intervalMs = 1000;
  let maxFrames = 60;
  const positional: string[] = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--interval-ms") {
      const value = args[++index];
      if (!value || value.startsWith("--")) return { error: { code: "invalid_args", message: "record start --interval-ms requires a value" } };
      const parsed = parseBoundedRecordInteger(value, "--interval-ms", 250, 10_000);
      if ("error" in parsed) return parsed;
      intervalMs = parsed.value;
      continue;
    }
    if (arg === "--max-frames") {
      const value = args[++index];
      if (!value || value.startsWith("--")) return { error: { code: "invalid_args", message: "record start --max-frames requires a value" } };
      const parsed = parseBoundedRecordInteger(value, "--max-frames", 1, 120);
      if ("error" in parsed) return parsed;
      maxFrames = parsed.value;
      continue;
    }
    if (arg.startsWith("--")) return { error: { code: "invalid_args", message: `record start does not support argument: ${arg}` } };
    positional.push(arg);
    if (positional.length > 2) {
      return { error: { code: "invalid_args", message: `record start unexpected argument: ${arg}` } };
    }
  }
  const positionalResult = parseRecordStartPositionals(positional);
  if ("error" in positionalResult) return positionalResult;
  return { intervalMs, maxFrames, ...positionalResult };
}

function parseRecordStartPositionals(args: string[]): { outputDir?: string; url?: string } | CommandErrorResult {
  if (args.length === 0) return {};
  if (args.length === 1) return looksLikeRecordUrl(args[0]) ? { url: args[0] } : { outputDir: args[0] };
  const [outputDir, url] = args;
  if (looksLikeRecordUrl(outputDir) && !looksLikeRecordUrl(url)) {
    return { error: { code: "invalid_args", message: "record start expects <output-dir> before optional <url>" } };
  }
  return { outputDir, url };
}

function looksLikeRecordUrl(value: string) {
  return /^(https?:|file:|about:)/i.test(value) || /^[\w.-]+\.[a-z]{2,}([/:?#]|$)/i.test(value);
}

function parseRecordStopArgs(args: string[]): RecordStopArgs | CommandErrorResult {
  let outputDir: string | undefined;
  for (const arg of args) {
    if (arg.startsWith("--")) {
      return { error: { code: "invalid_args", message: `record stop does not support argument: ${arg}` } };
    }
    if (outputDir) {
      return { error: { code: "invalid_args", message: `record stop unexpected argument: ${arg}` } };
    }
    outputDir = arg;
  }
  return { outputDir };
}

function parseBoundedRecordInteger(value: string, label: string, min: number, max: number): RecordValueResult | CommandErrorResult {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { error: { code: "invalid_args", message: `record start ${label} must be an integer from ${min} to ${max}` } };
  }
  return { value: parsed };
}

function recordingStatus(tab: TabRecord, recording: VisualRecording | undefined) {
  const now = Date.now();
  return {
    active: Boolean(recording?.active),
    startedAt: recording?.startedAt,
    durationMs: recording ? now - recording.startedAt : undefined,
    outputDir: recording?.outputDir,
    intervalMs: recording?.intervalMs,
    maxFrames: recording?.maxFrames,
    frameCount: recording?.frames.length ?? 0,
    stoppedReason: recording?.stoppedReason,
    tabId: tab.tabId,
    agentId: tab.agentId,
    url: tab.url,
    title: tab.title,
    videoRecording: false,
    nativeWebM: false,
  };
}

async function captureRecordingFrame(recording: VisualRecording) {
  if (!recording.active || recording.capturing) return;
  if (recording.frames.length >= recording.maxFrames) {
    stopVisualRecording(recording, "max_frames");
    return;
  }
  recording.capturing = true;
  const capturedAt = Date.now();
  const frame: VisualRecordingFrame = {
    index: recording.frames.length + 1,
    capturedAt,
    elapsedMs: capturedAt - recording.startedAt,
    tabId: recording.tabId,
  };
  try {
    const tab = await browser.tabs.get(recording.tabId);
    frame.windowId = tab.windowId;
    frame.url = tab.url;
    frame.title = tab.title;
    if (typeof tab.windowId !== "number") throw new Error("tab has no window id");
    frame.dataUrl = await browser.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  } catch (error) {
    frame.error = {
      code: "record_frame_failed",
      message: error instanceof Error ? error.message : String(error),
    };
  } finally {
    recording.frames.push(frame);
    recording.capturing = false;
    if (recording.frames.length >= recording.maxFrames) stopVisualRecording(recording, "max_frames");
  }
}

function stopVisualRecording(recording: VisualRecording | undefined, reason: string) {
  if (!recording) return;
  recording.active = false;
  recording.stoppedReason = reason;
  clearVisualRecordingTimer(recording);
}

function clearVisualRecordingTimer(recording: VisualRecording | undefined) {
  if (recording?.timer !== undefined) {
    clearInterval(recording.timer);
    recording.timer = undefined;
  }
}

async function materializeRecordingFrames(recording: VisualRecording, outputDir: string) {
  const frames: Record<string, unknown>[] = [];
  for (const frame of recording.frames) {
    const publicFrame: Record<string, unknown> = {
      index: frame.index,
      capturedAt: frame.capturedAt,
      elapsedMs: frame.elapsedMs,
      tabId: frame.tabId,
      windowId: frame.windowId,
      url: frame.url,
      title: frame.title,
    };
    if (frame.error) publicFrame.error = frame.error;
    if (frame.dataUrl) {
      publicFrame.screenshot = await sendScreenshotChunks(frame.dataUrl);
      publicFrame.screenshotPath = recordingFramePath(outputDir, frame.index);
    }
    frames.push(publicFrame);
  }
  return frames;
}

function recordingFramePath(outputDir: string, index: number) {
  const cleanDir = outputDir.replace(/[\\/]+$/, "");
  return `${cleanDir}/frame-${String(index).padStart(4, "0")}.png`;
}

function recordFirefoxWarning() {
  return bestEffortWarning(
    "record",
    "Firefox record is a screenshot-sequence QA evidence bundle. It is not native WebM video, live viewport streaming, or Chrome DevTools screencast output."
  );
}

async function vitalsCommand(args: string[], _domainPolicy: DomainPolicyContext | null) {
  const parsed = parseVitalsArgs(args);
  if ("error" in parsed) return parsed;
  const opened = parsed.url ? await openCommand([parsed.url], "open") : null;
  if (opened && "error" in opened) return opened;
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, 0, { type: "vitals" });
  const result = normalizeContentResponse(response);
  if ("error" in result) return result;
  return {
    ...result,
    tab,
    open: opened ? resultSummary(opened) : undefined,
    warnings: mergeWarnings(
      opened ? (opened as any).warnings : undefined,
      (result as any).warnings,
      bestEffortWarning(
        "vitals",
        "Firefox exposes a subset of Chrome Web Vitals timing APIs to WebExtensions; unavailable metrics are reported explicitly."
      )
    ),
  };
}

function parseVitalsArgs(args: string[]): { url?: string } | { error: RpcResponse["error"] } {
  let url: string | undefined;
  for (const arg of args) {
    if (arg === "--json") continue;
    if (arg.startsWith("-")) {
      return { error: { code: "invalid_args", message: `vitals does not support option: ${arg}` } };
    }
    if (url) {
      return { error: { code: "invalid_args", message: "vitals accepts at most one URL" } };
    }
    url = arg;
  }
  return { url };
}

async function reactCommand(args: string[]) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "tree") {
    const parsed = parseReactTreeArgs(rest);
    if ("error" in parsed) return parsed;
    const tab = await targetTab();
    const response = await sendFrame(
      tab.tabId,
      targetFrameIdForTab(tab.tabId),
      { type: "react_tree", selector: parsed.selector, maxDepth: parsed.maxDepth },
      { staleOnFrameRoutingError: true }
    );
    const result = normalizeContentResponse(response);
    return "error" in result ? result : { ...result, tab };
  }
  if (subcommand === "inspect") {
    const parsed = parseReactInspectArgs(rest);
    if ("error" in parsed) return parsed;
    const tab = await targetTab();
    const response = await sendFrame(
      tab.tabId,
      targetFrameIdForTab(tab.tabId, parsed.frameId),
      { type: "react_inspect", target: parsed.target, locator: parsed.locator },
      { staleOnFrameRoutingError: true }
    );
    const result = normalizeContentResponse(response);
    return "error" in result ? result : { ...result, tab };
  }
  if (subcommand === "renders") {
    const parsed = parseReactRendersArgs(rest);
    if ("error" in parsed) return parsed;
    const tab = await targetTab();
    const response = await sendFrame(
      tab.tabId,
      targetFrameIdForTab(tab.tabId),
      { type: "react_renders", action: parsed.action },
      { staleOnFrameRoutingError: true }
    );
    const result = normalizeContentResponse(response);
    return "error" in result ? result : { ...result, tab };
  }
  if (subcommand === "suspense") {
    const parsed = parseReactSuspenseArgs(rest);
    if ("error" in parsed) return parsed;
    const tab = await targetTab();
    const response = await sendFrame(
      tab.tabId,
      targetFrameIdForTab(tab.tabId),
      { type: "react_suspense", onlyDynamic: parsed.onlyDynamic },
      { staleOnFrameRoutingError: true }
    );
    const result = normalizeContentResponse(response);
    return "error" in result ? result : { ...result, tab };
  }
  return { error: { code: "invalid_args", message: "react requires tree, inspect <fiberId|target>, renders start|stop, or suspense" } };
}

function parseReactTreeArgs(args: string[]): { selector?: string; maxDepth?: number } | { error: RpcResponse["error"] } {
  let selector: string | undefined;
  let maxDepth: number | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--json") continue;
    if (arg === "-s" || arg === "--selector" || arg === "--scope") {
      selector = args[index + 1];
      if (!selector || selector.startsWith("-")) {
        return { error: { code: "invalid_args", message: `${arg} requires a CSS selector` } };
      }
      index += 1;
      continue;
    }
    if (arg === "-d" || arg === "--depth" || arg === "--max-depth") {
      const parsed = parseReactDepth(args[index + 1], arg);
      if ("error" in parsed) return parsed;
      maxDepth = parsed.depth;
      index += 1;
      continue;
    }
    if (arg.startsWith("--depth=")) {
      const parsed = parseReactDepth(arg.slice("--depth=".length), "--depth");
      if ("error" in parsed) return parsed;
      maxDepth = parsed.depth;
      continue;
    }
    if (arg.startsWith("--max-depth=")) {
      const parsed = parseReactDepth(arg.slice("--max-depth=".length), "--max-depth");
      if ("error" in parsed) return parsed;
      maxDepth = parsed.depth;
      continue;
    }
    if (arg.startsWith("-")) {
      return { error: { code: "invalid_args", message: `Unsupported react tree option: ${arg}` } };
    }
    return { error: { code: "invalid_args", message: `Unexpected react tree argument: ${arg}` } };
  }
  return { selector, maxDepth };
}

function parseReactDepth(value: string | undefined, flag: string): { depth: number } | { error: RpcResponse["error"] } {
  if (!value || value.startsWith("-")) {
    return { error: { code: "invalid_args", message: `${flag} requires a non-negative integer depth` } };
  }
  const depth = Number(value);
  if (!Number.isInteger(depth) || depth < 0) {
    return { error: { code: "invalid_args", message: `${flag} requires a non-negative integer depth` } };
  }
  return { depth };
}

function parseReactInspectArgs(args: string[]):
  | { target: string; locator?: Locator; frameId?: number }
  | { error: RpcResponse["error"] } {
  const target = firstPositionalArg(args, ["--selector"]);
  const selector = valueAfter(args, "--selector");
  const actualTarget = selector || target;
  if (!actualTarget) {
    return { error: { code: "invalid_args", message: "react inspect requires a fiber id, ref, or CSS selector" } };
  }
  if (/^r\d+$/i.test(actualTarget)) return { target: actualTarget };
  const locator = locatorFromTarget(actualTarget);
  if ("error" in locator) return { error: { code: locator.error.code, message: locator.error.message } };
  return { target: actualTarget, locator: locator.locator, frameId: locator.frameId };
}

function parseReactRendersArgs(args: string[]): { action: "start" | "stop" } | { error: RpcResponse["error"] } {
  const action = firstPositionalArg(args, []);
  if (action !== "start" && action !== "stop") {
    return { error: { code: "invalid_args", message: "react renders requires start or stop" } };
  }
  for (const arg of args) {
    if (arg === action || arg === "--json") continue;
    return { error: { code: "invalid_args", message: `Unsupported react renders option: ${arg}` } };
  }
  return { action };
}

function parseReactSuspenseArgs(args: string[]): { onlyDynamic: boolean } | { error: RpcResponse["error"] } {
  let onlyDynamic = false;
  for (const arg of args) {
    if (arg === "--json") continue;
    if (arg === "--only-dynamic") {
      onlyDynamic = true;
      continue;
    }
    return { error: { code: "invalid_args", message: `Unsupported react suspense option: ${arg}` } };
  }
  return { onlyDynamic };
}

async function networkCommand(args: string[]) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand.startsWith("--") || subcommand === "requests") {
    return networkRequestsCommand(subcommand?.startsWith("--") ? args : rest);
  }
  if (subcommand === "request") return networkRequestDetailCommand(rest);
  if (subcommand === "wait-for-request") return networkWaitCommand("request", rest);
  if (subcommand === "wait-for-response") return networkWaitCommand("response", rest);
  if (subcommand === "route") return networkRouteCommand(rest);
  if (subcommand === "unroute") return networkUnrouteCommand(rest);
  if (subcommand === "har" || subcommand === "export-har") return networkHarCommand(rest);
  return { error: { code: "invalid_args", message: "network requires requests|request|wait-for-request|wait-for-response|route|unroute|har|export-har" } };
}

async function networkRouteCommand(args: string[]) {
  const tab = await targetTab();
  const parsed = parseNetworkRouteArgs(args);
  if ("error" in parsed) return parsed;
  const id = `nr${nextNetworkRouteNumber++}`;
  const route: NetworkRouteRule = {
    id,
    tabId: tab.tabId,
    pattern: parsed.pattern,
    abort: parsed.abort,
    body: parsed.body,
    contentType: parsed.contentType,
    resourceTypes: parsed.resourceTypes,
    createdAt: Date.now(),
  };
  networkRoutes.set(id, route);
  return {
    text: `Registered network route ${id} for ${route.pattern} (${networkRouteAction(route)})`,
    route: publicNetworkRoute(route),
  };
}

async function networkUnrouteCommand(args: string[]) {
  const tab = await targetTab();
  const pattern = firstPositionalArg(args, []);
  const unexpected = args.filter((arg, index) => index > 0 || arg.startsWith("--"));
  if (unexpected.length > 0) {
    return { error: { code: "invalid_args", message: `network unroute does not support argument: ${unexpected[0]}` } };
  }
  let removed = 0;
  for (const [id, route] of Array.from(networkRoutes.entries())) {
    if (route.tabId !== tab.tabId) continue;
    if (pattern && route.pattern !== pattern && route.id !== pattern) continue;
    networkRoutes.delete(id);
    removed += 1;
  }
  return {
    text: pattern
      ? `Removed ${removed} network route${removed === 1 ? "" : "s"} for ${pattern}`
      : `Removed ${removed} network route${removed === 1 ? "" : "s"}`,
    removed,
  };
}

function parseNetworkRouteArgs(args: string[]):
  | { pattern: string; abort: boolean; body?: string; contentType?: string; resourceTypes?: string[] }
  | { error: RpcResponse["error"] } {
  const pattern = firstPositionalArg(args, ["--body", "--resource-type", "--type", "--content-type"]);
  if (!pattern) return { error: { code: "invalid_args", message: "network route requires <url-pattern>" } };
  const abort = args.includes("--abort");
  const body = valueAfter(args, "--body");
  const contentType = valueAfter(args, "--content-type") ?? inferRouteContentType(body);
  const resourceTypeValue = valueAfter(args, "--resource-type") ?? valueAfter(args, "--type");
  const resourceTypes = resourceTypeValue
    ?.split(",")
    .map((part) => normalizeNetworkType(part.trim()))
    .filter(Boolean);
  if (abort && body !== undefined) {
    return { error: { code: "invalid_args", message: "network route cannot combine --abort and --body" } };
  }
  const valueFlags = new Set(["--body", "--resource-type", "--type", "--content-type"]);
  const boolFlags = new Set(["--abort"]);
  let positionalCount = 0;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) return { error: { code: "invalid_args", message: `${arg} requires a value` } };
      index += 1;
      continue;
    }
    if (boolFlags.has(arg)) continue;
    if (arg.startsWith("--")) return { error: { code: "invalid_args", message: `network route does not support argument: ${arg}` } };
    positionalCount += 1;
    if (positionalCount > 1) return { error: { code: "invalid_args", message: `network route unexpected argument: ${arg}` } };
  }
  return { pattern, abort, body, contentType, resourceTypes };
}

function inferRouteContentType(body?: string) {
  if (body === undefined) return undefined;
  const trimmed = body.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    return "application/json";
  }
  return "text/plain";
}

function publicNetworkRoute(route: NetworkRouteRule) {
  return {
    id: route.id,
    pattern: route.pattern,
    action: networkRouteAction(route),
    resourceTypes: route.resourceTypes ?? [],
    tabId: route.tabId,
    createdAt: route.createdAt,
  };
}

function networkRouteAction(route: NetworkRouteRule) {
  if (route.abort) return "abort";
  if (route.body !== undefined) return "mock";
  return "continue";
}

async function networkRequestsCommand(args: string[]) {
  const tab = await targetTab();
  const clear = args.includes("--clear");
  const filter = valueAfter(args, "--filter");
  const typeFilter = valueAfter(args, "--type");
  const methodFilter = valueAfter(args, "--method");
  const statusFilter = valueAfter(args, "--status");
  const invalid = invalidNetworkRequestsArgs(args);
  if (invalid) return invalid;

  const records = networkRecordsForTab(tab.tabId)
    .filter((record) => networkRecordMatches(record, { filter, typeFilter, methodFilter, statusFilter }))
    .map(publicNetworkRecord);
  if (clear) {
    const cleared = clearNetworkLog(tab.tabId);
    return {
      text: `Cleared ${cleared} network request${cleared === 1 ? "" : "s"}`,
      requests: records,
      count: records.length,
      cleared,
    };
  }
  return {
    text: formatNetworkRecords(records),
    requests: records,
    count: records.length,
  };
}

async function networkWaitCommand(mode: "request" | "response", args: string[]) {
  const tab = await targetTab();
  const parsed = parseNetworkWaitArgs(mode, args);
  if ("error" in parsed) return parsed;
  const startedAt = Date.now();
  const deadline = startedAt + parsed.timeout;
  while (Date.now() <= deadline) {
    const record = networkRecordsForTab(tab.tabId).find((candidate) => networkWaitRecordMatches(candidate, parsed, mode));
    if (record) {
      const request = publicNetworkRecord(record);
      return {
        text: formatNetworkWaitResult(mode, request),
        request,
        wait: {
          kind: mode === "request" ? "network-request" : "network-response",
          pattern: parsed.pattern,
          timeout: parsed.timeout,
          elapsedMs: Math.max(0, Date.now() - startedAt),
        },
      };
    }
    await delay(NETWORK_IDLE_POLL_INTERVAL_MS);
  }
  return {
    error: {
      code: "timeout",
      message: `Timed out waiting for network ${mode} matching ${parsed.pattern} after ${parsed.timeout}ms`,
      data: {
        pattern: parsed.pattern,
        timeout: parsed.timeout,
        type: parsed.typeFilter,
        method: parsed.methodFilter,
        status: parsed.statusFilter,
      },
    },
  };
}

function parseNetworkWaitArgs(
  mode: "request" | "response",
  args: string[]
):
  | { pattern: string; timeout: number; typeFilter?: string; methodFilter?: string; statusFilter?: string }
  | { error: RpcResponse["error"] } {
  const valueFlags = new Set(["--timeout", "--type", "--method", "--status"]);
  const pattern = firstPositionalArg(args, Array.from(valueFlags));
  if (!pattern) {
    return {
      error: {
        code: "invalid_args",
        message: `network wait-for-${mode} requires <url-pattern>`,
      },
    };
  }
  const timeoutResult = parseTimeoutOption(args, 10000);
  if ("error" in timeoutResult) return { error: timeoutResult.error };
  if (mode === "request" && valueAfter(args, "--status") !== undefined) {
    return { error: { code: "invalid_args", message: "network wait-for-request does not support --status; use wait-for-response" } };
  }
  let positionalCount = 0;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { error: { code: "invalid_args", message: `${arg} requires a value` } };
      }
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      return { error: { code: "invalid_args", message: `network wait-for-${mode} does not support argument: ${arg}` } };
    }
    positionalCount += 1;
    if (positionalCount > 1) {
      return { error: { code: "invalid_args", message: `network wait-for-${mode} unexpected argument: ${arg}` } };
    }
  }
  return {
    pattern,
    timeout: timeoutResult.ms,
    typeFilter: valueAfter(args, "--type"),
    methodFilter: valueAfter(args, "--method"),
    statusFilter: mode === "response" ? valueAfter(args, "--status") : undefined,
  };
}

function networkWaitRecordMatches(
  record: NetworkActivityRecord,
  filters: { pattern: string; typeFilter?: string; methodFilter?: string; statusFilter?: string },
  mode: "request" | "response"
) {
  if (mode === "response" && (record.active || record.error || typeof record.statusCode !== "number")) return false;
  return networkRecordMatches(record, {
    filter: filters.pattern,
    typeFilter: filters.typeFilter,
    methodFilter: filters.methodFilter,
    statusFilter: filters.statusFilter,
  });
}

function formatNetworkWaitResult(mode: "request" | "response", record: ReturnType<typeof publicNetworkRecord>) {
  const method = record.method ?? "GET";
  const status = mode === "response" ? ` ${record.statusCode}` : "";
  return `Matched network ${mode} ${record.requestId}${status} ${method} ${truncate(record.url ?? "", 180)}`;
}

async function networkHarCommand(args: string[]) {
  const tab = await targetTab();
  const mode = networkHarMode(args);
  const commandArgs = networkHarCommandArgs(args, mode);
  const invalid = invalidNetworkHarArgs(commandArgs, mode);
  if (invalid) return invalid;

  if (mode === "start") {
    const startedAt = Date.now();
    networkHarRecordingStartedAtByTabId.set(tab.tabId, startedAt);
    return {
      text: `Started HAR recording in ${tab.agentId}`,
      harRecording: {
        active: true,
        startedAt,
        tabId: tab.tabId,
        agentId: tab.agentId,
      },
      warnings: [networkHarMetadataWarning()],
    };
  }

  const recordingStartedAt = mode === "stop" ? networkHarRecordingStartedAtByTabId.get(tab.tabId) : undefined;
  if (mode === "stop" && recordingStartedAt === undefined) {
    return {
      error: {
        code: "invalid_state",
        message: "No HAR recording is active for the current tab. Run `network har start` before `network har stop`.",
      },
    };
  }

  const path = firstPositionalArg(commandArgs, ["--filter", "--type", "--method", "--status"]);
  const filter = valueAfter(commandArgs, "--filter");
  const typeFilter = valueAfter(commandArgs, "--type");
  const methodFilter = valueAfter(commandArgs, "--method");
  const statusFilter = valueAfter(commandArgs, "--status");
  const records = networkRecordsForTab(tab.tabId)
    .filter((record) => recordingStartedAt === undefined || record.startedAt >= recordingStartedAt)
    .filter((record) => networkRecordMatches(record, { filter, typeFilter, methodFilter, statusFilter }))
    .map(publicNetworkRecord);
  const har = networkHarForRecords(records, tab, { startedAt: recordingStartedAt });
  if (mode === "stop") networkHarRecordingStartedAtByTabId.delete(tab.tabId);
  return {
    text: path ? `Prepared HAR with ${records.length} request${records.length === 1 ? "" : "s"} for ${path}` : JSON.stringify(har, null, 2),
    har,
    path,
    count: records.length,
    harRecording: {
      active: false,
      mode,
      startedAt: recordingStartedAt,
      stoppedAt: mode === "stop" ? Date.now() : undefined,
      tabId: tab.tabId,
      agentId: tab.agentId,
    },
    warnings: [networkHarMetadataWarning()],
  };
}

function networkHarMode(args: string[]): "export" | "start" | "stop" {
  if (args[0] === "start") return "start";
  if (args[0] === "stop") return "stop";
  return "export";
}

function networkHarCommandArgs(args: string[], mode: "export" | "start" | "stop") {
  return mode === "export" ? args : args.slice(1);
}

function networkHarMetadataWarning() {
  return bestEffortWarning(
    "network har",
    "HAR export is built from Firefox WebExtension request metadata. Request/response headers, captured request bodies, and bounded text-like response previews are redacted/truncated; cookies, binary bodies, streaming payloads, and raw secrets are not captured."
  );
}

function invalidNetworkHarArgs(args: string[], mode: "export" | "start" | "stop") {
  if (mode === "start" && args.length > 0) {
    return { error: { code: "invalid_args", message: "network har start does not accept filters or an output path" } };
  }
  const valueFlags = new Set(["--filter", "--type", "--method", "--status"]);
  let positionalCount = 0;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { error: { code: "invalid_args", message: `${arg} requires a value` } };
      }
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      return { error: { code: "invalid_args", message: `network har does not support argument: ${arg}` } };
    }
    positionalCount += 1;
    if (positionalCount > 1) {
      return { error: { code: "invalid_args", message: `network har unexpected argument: ${arg}` } };
    }
  }
  return null;
}

function invalidNetworkRequestsArgs(args: string[]) {
  const valueFlags = new Set(["--filter", "--type", "--method", "--status"]);
  const boolFlags = new Set(["--clear"]);
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { error: { code: "invalid_args", message: `${arg} requires a value` } };
      }
      index += 1;
      continue;
    }
    if (boolFlags.has(arg)) continue;
    return { error: { code: "invalid_args", message: `network requests does not support argument: ${arg}` } };
  }
  return null;
}

async function networkRequestDetailCommand(args: string[]) {
  const requestId = firstPositionalArg(args, []);
  if (!requestId) return { error: { code: "invalid_args", message: "network request requires <requestId>" } };
  const record = networkRequestsById.get(requestId);
  if (!record) {
    return {
      error: {
        code: "not_found",
        message: `No network request recorded with id ${requestId}`,
      },
    };
  }
  const request = publicNetworkRecord(record);
  return {
    text: formatNetworkDetail(request),
    request,
  };
}

function networkRecordsForTab(tabId: number) {
  return (networkRequestLogIdsByTabId.get(tabId) ?? [])
    .map((id) => networkRequestsById.get(id))
    .filter((record): record is NetworkActivityRecord => Boolean(record))
    .sort((left, right) => left.startedAt - right.startedAt);
}

function networkRecordMatches(
  record: NetworkActivityRecord,
  filters: { filter?: string; typeFilter?: string; methodFilter?: string; statusFilter?: string }
) {
  if (filters.filter && !networkUrlMatches(record.url ?? "", filters.filter)) return false;
  if (filters.typeFilter && !networkTypeMatches(record.type, filters.typeFilter)) return false;
  if (filters.methodFilter && record.method?.toUpperCase() !== filters.methodFilter.toUpperCase()) return false;
  if (filters.statusFilter && !networkStatusMatches(record.statusCode, filters.statusFilter)) return false;
  return true;
}

function networkUrlMatches(url: string, pattern: string) {
  if (pattern.includes("*")) {
    try {
      return globToRegExp(pattern).test(url);
    } catch {
      return false;
    }
  }
  return url.toLowerCase().includes(pattern.toLowerCase());
}

function networkTypeMatches(type: string | undefined, filter: string) {
  const normalized = normalizeNetworkType(type);
  const accepted = filter.split(",").map((part) => normalizeNetworkType(part.trim())).filter(Boolean);
  return accepted.includes(normalized);
}

function normalizeNetworkType(type?: string) {
  const value = String(type ?? "").toLowerCase();
  if (value === "xhr" || value === "fetch") return "xmlhttprequest";
  return value;
}

function networkStatusMatches(statusCode: number | undefined, filter: string) {
  if (typeof statusCode !== "number") return false;
  const value = filter.trim().toLowerCase();
  const family = /^([1-5])xx$/.exec(value);
  if (family) {
    const start = Number(family[1]) * 100;
    return statusCode >= start && statusCode <= start + 99;
  }
  const range = /^(\d{3})-(\d{3})$/.exec(value);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    return statusCode >= start && statusCode <= end;
  }
  const exact = Number(value);
  return Number.isInteger(exact) && statusCode === exact;
}

function publicNetworkRecord(record: NetworkActivityRecord) {
  return {
    id: record.requestId,
    requestId: record.requestId,
    url: record.url,
    method: record.method ?? "GET",
    type: record.type,
    status: record.statusCode,
    statusCode: record.statusCode,
    statusLine: record.statusLine,
    error: record.error,
    active: record.active === true,
    fromCache: record.fromCache,
    frameId: record.frameId,
    parentFrameId: record.parentFrameId,
    documentUrl: record.documentUrl,
    initiator: record.initiator,
    startedAt: record.startedAt,
    completedAt: record.completedAt,
    durationMs: record.durationMs,
    requestHeaders: record.requestHeaders ?? [],
    responseHeaders: record.responseHeaders ?? [],
    requestBody: record.requestBody,
    responseBody: record.responseBody,
    requestBodySize: record.requestBody?.size,
    responseBodySize: record.responseBody?.size ?? responseContentLength(record.responseHeaders),
    responseMimeType: record.responseBody?.mimeType ?? responseContentType(record.responseHeaders),
    routeId: record.routeId,
    routeAction: record.routeAction,
  };
}

function formatNetworkRecords(records: ReturnType<typeof publicNetworkRecord>[]) {
  if (!records.length) return "No network requests recorded";
  return records.map(formatNetworkRecordLine).join("\n");
}

function formatNetworkRecordLine(record: ReturnType<typeof publicNetworkRecord>) {
  const status = record.active ? "active" : record.error ? "ERR" : typeof record.statusCode === "number" ? String(record.statusCode) : "-";
  const method = record.method ?? "GET";
  const type = record.type ? ` ${record.type}` : "";
  const duration = typeof record.durationMs === "number" ? ` ${record.durationMs}ms` : "";
  const route = record.routeAction ? ` route:${record.routeAction}` : "";
  return `${record.requestId} ${status} ${method} ${truncate(record.url ?? "", 180)}${type}${duration}${route}`;
}

function formatNetworkDetail(record: ReturnType<typeof publicNetworkRecord>) {
  return [
    `Request: ${record.requestId}`,
    `URL: ${record.url ?? ""}`,
    `Method: ${record.method ?? "GET"}`,
    `Type: ${record.type ?? ""}`,
    `Status: ${record.statusCode ?? (record.error ? "error" : record.active ? "active" : "")}`,
    record.routeAction ? `Route: ${record.routeAction}${record.routeId ? ` (${record.routeId})` : ""}` : "",
    record.error ? `Error: ${record.error}` : "",
    typeof record.durationMs === "number" ? `Duration: ${record.durationMs}ms` : "",
    formatNetworkHeaders("Request headers", record.requestHeaders),
    formatNetworkRequestBody(record.requestBody),
    formatNetworkHeaders("Response headers", record.responseHeaders),
    formatNetworkResponseBody(record.responseBody),
  ].filter(Boolean).join("\n");
}

function formatNetworkHeaders(label: string, headers: NetworkHeaderRecord[] | undefined) {
  if (!headers?.length) return "";
  return `${label}:\n${headers.map((header) => `  ${header.name}: ${header.value}`).join("\n")}`;
}

function formatNetworkRequestBody(body: NetworkBodyRecord | undefined) {
  return formatNetworkBody("Request body", body);
}

function formatNetworkResponseBody(body: NetworkBodyRecord | undefined) {
  return formatNetworkBody("Response body", body);
}

function formatNetworkBody(labelPrefix: string, body: NetworkBodyRecord | undefined) {
  if (!body) return "";
  const suffix = [
    typeof body.size === "number" ? `${body.size} bytes` : "",
    body.mimeType ?? "",
    body.redacted ? "redacted" : "",
    body.truncated ? "truncated" : "",
  ].filter(Boolean).join(", ");
  const label = `${labelPrefix} (${body.kind}${suffix ? `, ${suffix}` : ""})`;
  if (body.kind === "error") return `${label}: ${body.error ?? "unavailable"}`;
  if (body.fields?.length) {
    return `${label}:\n${body.fields.map((field) => `  ${field.name}: ${field.value}`).join("\n")}`;
  }
  if (body.text) return `${label}:\n  ${body.text}`;
  return `${label}: captured without displayable text`;
}

function networkHarForRecords(records: ReturnType<typeof publicNetworkRecord>[], tab: TabRecord, options: { startedAt?: number } = {}) {
  const pageStartedAt = options.startedAt ?? Math.min(...records.map((record) => record.startedAt).filter(Number.isFinite), Date.now());
  return {
    log: {
      version: "1.2",
      creator: {
        name: "pire-browser",
        version: browser.runtime.getManifest().version,
        comment: "Firefox WebExtension export; request/response headers, request bodies, and bounded text-like response previews are redacted/truncated when Firefox exposes them; cookies, binary bodies, streaming payloads, and raw secrets are not captured.",
      },
      browser: {
        name: "Firefox",
        version: "",
      },
      pages: [
        {
          startedDateTime: new Date(pageStartedAt).toISOString(),
          id: `page_${tab.agentId}`,
          title: tab.title ?? "",
          pageTimings: {
            onContentLoad: -1,
            onLoad: -1,
          },
          _url: tab.url,
        },
      ],
      entries: records.map((record) => networkHarEntry(record, tab)),
    },
  };
}

function networkHarEntry(record: ReturnType<typeof publicNetworkRecord>, tab: TabRecord) {
  const startedAt = typeof record.startedAt === "number" ? record.startedAt : Date.now();
  const duration = typeof record.durationMs === "number" ? record.durationMs : record.active ? Math.max(0, Date.now() - startedAt) : 0;
  const status = typeof record.statusCode === "number" ? record.statusCode : 0;
  return {
    pageref: `page_${tab.agentId}`,
    startedDateTime: new Date(startedAt).toISOString(),
    time: duration,
    request: {
      method: record.method ?? "GET",
      url: record.url ?? "",
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: harHeaders(record.requestHeaders),
      queryString: harQueryString(record.url),
      headersSize: -1,
      bodySize: typeof record.requestBodySize === "number" ? record.requestBodySize : -1,
      ...(record.requestBody ? { postData: harPostData(record) } : {}),
    },
    response: {
      status,
      statusText: harStatusText(record),
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: harHeaders(record.responseHeaders),
      content: harResponseContent(record),
      redirectURL: "",
      headersSize: -1,
      bodySize: typeof record.responseBodySize === "number" ? record.responseBodySize : -1,
      _error: record.error,
      _fromCache: record.fromCache,
    },
    cache: {},
    timings: {
      blocked: -1,
      dns: -1,
      connect: -1,
      send: 0,
      wait: duration,
      receive: 0,
      ssl: -1,
    },
    _pireBrowser: {
      requestId: record.requestId,
      type: record.type,
      active: record.active,
      frameId: record.frameId,
      parentFrameId: record.parentFrameId,
      documentUrl: record.documentUrl,
      initiator: record.initiator,
      routeId: record.routeId,
      routeAction: record.routeAction,
    },
  };
}

function harPostData(record: ReturnType<typeof publicNetworkRecord>) {
  const body = record.requestBody;
  const postData: Record<string, unknown> = {
    mimeType: requestContentType(record.requestHeaders),
    text: body?.text ?? "",
  };
  if (body?.fields?.length) {
    postData.params = body.fields.map((field) => ({
      name: field.name,
      value: field.value,
      ...(field.redacted ? { _redacted: true } : {}),
      ...(field.truncated ? { _truncated: true } : {}),
    }));
  }
  if (body?.encoding) postData._encoding = body.encoding;
  if (body?.redacted) postData._redacted = true;
  if (body?.truncated) postData._truncated = true;
  if (body?.error) postData._error = body.error;
  return postData;
}

function harResponseContent(record: ReturnType<typeof publicNetworkRecord>) {
  const content: Record<string, unknown> = {
    size: typeof record.responseBodySize === "number" ? record.responseBodySize : -1,
    mimeType: record.responseMimeType ?? "x-unknown",
  };
  if (record.responseBody?.kind === "text" && record.responseBody.text !== undefined) {
    content.text = record.responseBody.text;
    if (record.responseBody.encoding) content.encoding = record.responseBody.encoding;
    if (record.responseBody.redacted) content._redacted = true;
    if (record.responseBody.truncated) content._truncated = true;
  }
  if (record.responseBody?.kind === "binary") {
    content._omitted = true;
  }
  if (record.responseBody?.kind === "error") {
    content._error = record.responseBody.error ?? "response body capture failed";
  }
  return content;
}

function harHeaders(headers?: NetworkHeaderRecord[]) {
  return (headers ?? []).map((header) => ({
    name: header.name,
    value: header.value,
    ...(header.redacted ? { _redacted: true } : {}),
  }));
}

function responseContentLength(headers?: NetworkHeaderRecord[]) {
  const value = networkHeaderValueByName(headers, "content-length");
  const parsed = value === undefined ? NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function responseContentType(headers?: NetworkHeaderRecord[]) {
  return networkHeaderValueByName(headers, "content-type")?.split(";")[0]?.trim() || undefined;
}

function requestContentType(headers?: NetworkHeaderRecord[]) {
  return networkHeaderValueByName(headers, "content-type") || "application/octet-stream";
}

function networkHeaderValueByName(headers: NetworkHeaderRecord[] | undefined, name: string) {
  const lower = name.toLowerCase();
  return headers?.find((header) => header.name.toLowerCase() === lower)?.value;
}

function harStatusText(record: ReturnType<typeof publicNetworkRecord>) {
  if (record.error) return record.error;
  if (record.active) return "active";
  if (record.statusLine) return record.statusLine.replace(/^HTTP\/\S+\s+\d+\s*/, "");
  return "";
}

function harQueryString(url?: string) {
  if (!url) return [];
  try {
    const params: { name: string; value: string }[] = [];
    new URL(url).searchParams.forEach((value, name) => {
      params.push({ name, value });
    });
    return params;
  } catch {
    return [];
  }
}

function clearNetworkLog(tabId: number) {
  const ids = networkRequestLogIdsByTabId.get(tabId) ?? [];
  const activeIds = networkRequestIdsByTabId.get(tabId) ?? new Set<string>();
  let cleared = 0;
  for (const id of ids) {
    if (activeIds.has(id)) continue;
    networkRequestsById.delete(id);
    networkRouteMatchesByRequestId.delete(id);
    cleared += 1;
  }
  networkRequestLogIdsByTabId.set(tabId, [...activeIds]);
  return cleared;
}

async function recentDialogsForStatus(tabId: number) {
  const existing = recentDialogsByTabId.get(tabId) ?? [];
  if (existing.length > 0) return existing;
  const deadline = Date.now() + 750;
  while (Date.now() < deadline) {
    await collectDialogsForStatus(tabId);
    const collected = recentDialogsByTabId.get(tabId) ?? [];
    if (collected.length > 0) return collected;
    await delay(50);
    const dialogs = recentDialogsByTabId.get(tabId) ?? [];
    if (dialogs.length > 0) return dialogs;
  }
  await collectDialogsForStatus(tabId);
  const finalDialogs = recentDialogsByTabId.get(tabId) ?? [];
  if (finalDialogs.length > 0) return finalDialogs;
  return [];
}

async function collectDialogsForStatus(tabId: number) {
  const frames = await framesForScope(tabId, selectedFrameIdForTab(tabId));
  for (const frame of frames) {
    try {
      await sendFrame(tabId, frame.frameId, { type: "dialog_status" });
    } catch {
      // Cross-origin, opaque, or not-yet-ready frames may reject extension messages.
    }
  }
}

async function batchCommand(
  args: string[],
  domainPolicy: DomainPolicyContext | null,
  actionPolicy: ActionPolicyContext | null,
  confirmationPolicy: ConfirmationPolicyContext | null,
  params: Record<string, any> = {}
) {
  const bailOnError = args.includes("--bail");
  const commands = args.filter((arg) => arg !== "--bail");
  const results: Record<string, unknown>[] = [];
  for (const commandText of commands) {
    const commandArgs = splitCommand(commandText);
    const result = await executeCommandWithPolicies(
      commandArgs,
      domainPolicy,
      actionPolicy,
      confirmationPolicy,
      batchChildParams(commandArgs, params)
    );
    results.push(batchStepResult(commandArgs, result));
    const errorCode = (result.error as RpcResponse["error"])?.code;
    if ("error" in result && (errorCode === "DomainPolicyError" || errorCode === "ActionPolicyError" || errorCode === "ConfirmationRequired")) {
      return batchErrorResult(result.error as RpcResponse["error"], `Ran ${results.length} batch command(s)`, results);
    }
    if (bailOnError && "error" in result) {
      return batchErrorResult(result.error as RpcResponse["error"], `Ran ${results.length} batch command(s)`, results);
    }
  }
  return { text: `Ran ${results.length} batch command(s)`, results };
}

function batchChildParams(commandArgs: string[], params: Record<string, any>) {
  if (commandArgs[0] !== "screenshot" || params.hideScrollbars === undefined) return {};
  return { hideScrollbars: params.hideScrollbars };
}

function batchStepResult(command: string[], result: Record<string, unknown>) {
  if ("error" in result) {
    const error = result.error as RpcResponse["error"];
    return {
      command,
      success: false,
      error: error?.message ?? String(error ?? "unknown error"),
      errorCode: error?.code,
      result: null,
    };
  }
  return {
    command,
    success: true,
    error: null,
    result,
  };
}

function batchErrorResult(error: RpcResponse["error"], text: string, results: Record<string, unknown>[]) {
  const data = error?.data && typeof error.data === "object" ? error.data : {};
  return {
    error: {
      ...error,
      data: {
        ...data,
        batch: { text, results },
      },
    },
    text,
    results,
  };
}

async function cookiesCommand(args: string[]) {
  const tab = await targetTab();
  if (args[0] === "clear") {
    const cookies = await browser.cookies.getAll({ url: tab.url });
    await Promise.all(cookies.map((cookie: any) => browser.cookies.remove({ url: cookieUrl(cookie), name: cookie.name })));
    return { text: `Cleared ${cookies.length} cookie(s)` };
  }
  if (args[0] === "set") {
    const parsed = parseCookiesSetArgs(args.slice(1));
    if ("error" in parsed) return parsed;
    if (parsed.kind === "import") return importCookies(tab.url, parsed);
    await browser.cookies.set({ url: tab.url, name: parsed.name, value: parsed.value });
    return { text: `Set cookie ${parsed.name}` };
  }
  const cookies = await browser.cookies.getAll({ url: tab.url });
  return { text: cookies.map((cookie: any) => `${cookie.name}=${cookie.value}`).join("\n"), cookies };
}

type CookieImport = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  expirationDate?: number;
  storeId?: string;
  hostOnly?: boolean;
};

type ParsedCookiesSetArgs =
  | { kind: "single"; name: string; value: string }
  | { kind: "import"; payload: string; domain?: string };

function parseCookiesSetArgs(args: string[]): ParsedCookiesSetArgs | { error: RpcResponse["error"] } {
  const curlIndex = args.findIndex((arg) => arg === "--curl" || arg === "--curl-data");
  if (curlIndex >= 0) {
    const payload = args[curlIndex + 1];
    if (payload === undefined) {
      return { error: { code: "InvalidArgumentError", message: "cookies set --curl requires <file-or-cookie-data>" } };
    }
    let domain: string | undefined;
    for (let index = 0; index < args.length; index += 1) {
      if (index === curlIndex || index === curlIndex + 1) continue;
      const arg = args[index];
      if (arg === "--domain") {
        domain = args[index + 1];
        if (!domain) return { error: { code: "InvalidArgumentError", message: "cookies set --curl --domain requires <domain>" } };
        index += 1;
        continue;
      }
      return { error: { code: "InvalidArgumentError", message: `cookies set --curl does not accept ${arg}` } };
    }
    return { kind: "import", payload, domain };
  }

  const [name, value] = args;
  if (!name) return { error: { code: "InvalidArgumentError", message: "cookies set requires <name> <value>" } };
  return { kind: "single", name, value: value ?? "" };
}

async function importCookies(activeUrl: string | undefined, parsed: { payload: string; domain?: string }) {
  const target = cookieImportTargetUrl(activeUrl, parsed.domain);
  if ("error" in target) return target;
  const imported = parseCookieImportPayload(parsed.payload);
  if ("error" in imported) return imported;

  let cookiesSet = 0;
  let cookiesSkipped = 0;
  for (const cookie of imported.cookies) {
    if (await restoreCookie(target.url, cookie)) cookiesSet += 1;
    else cookiesSkipped += 1;
  }

  const warning =
    cookiesSkipped > 0
      ? [bestEffortWarning("cookies set --curl", `Skipped ${cookiesSkipped} cookie(s) whose metadata Firefox would not accept for ${target.host}.`)]
      : [];
  return {
    text: `Imported ${cookiesSet} cookie(s)${cookiesSkipped ? `; skipped ${cookiesSkipped}` : ""}`,
    cookiesImported: cookiesSet,
    cookiesSkipped,
    targetUrl: target.url,
    warnings: warning,
  };
}

function cookieImportTargetUrl(activeUrl: string | undefined, domain: string | undefined): { url: string; host: string } | { error: RpcResponse["error"] } {
  if (domain) {
    const normalized = normalizeCookieImportDomain(domain);
    if ("error" in normalized) return normalized;
    return normalized;
  }
  if (activeUrl) {
    try {
      const url = new URL(activeUrl);
      if (url.protocol === "http:" || url.protocol === "https:") return { url: url.toString(), host: url.host };
    } catch {
      // Fall through to the explicit error below.
    }
  }
  return {
    error: {
      code: "InvalidArgumentError",
      message: "cookies set --curl requires an active http(s) tab or --domain <domain>",
    },
  };
}

function normalizeCookieImportDomain(domain: string): { url: string; host: string } | { error: RpcResponse["error"] } {
  const trimmed = domain.trim();
  if (!trimmed) return { error: { code: "InvalidArgumentError", message: "cookies set --curl --domain requires a non-empty domain" } };
  try {
    const hostInput = trimmed === "::1" ? "[::1]" : trimmed.replace(/^\./, "");
    const url = trimmed.includes("://")
      ? new URL(trimmed)
      : new URL(`${isLocalCookieDomain(trimmed) ? "http" : "https"}://${hostInput}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: { code: "InvalidArgumentError", message: "cookies set --curl --domain must be http(s)" } };
    }
    if (!url.pathname || url.pathname === "") url.pathname = "/";
    return { url: url.toString(), host: url.host };
  } catch (error) {
    return { error: { code: "InvalidArgumentError", message: `Invalid cookies set --curl --domain value: ${error instanceof Error ? error.message : String(error)}` } };
  }
}

function isLocalCookieDomain(domain: string) {
  const raw = domain.replace(/^\./, "");
  const host = raw.startsWith("[") ? raw.slice(1, raw.indexOf("]")) : raw === "::1" ? raw : raw.split(/[/:]/, 1)[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

function parseCookieImportPayload(payload: string): { cookies: CookieImport[] } | { error: RpcResponse["error"] } {
  const trimmed = payload.trim();
  if (!trimmed) return { error: { code: "InvalidArgumentError", message: "cookies set --curl payload is empty" } };

  const jsonCookies = parseCookieImportJson(trimmed);
  if (jsonCookies) return jsonCookies;

  const header = extractCookieHeader(trimmed);
  if (!header) {
    return {
      error: {
        code: "InvalidArgumentError",
        message: "cookies set --curl could not find cookies in Copy-as-cURL, JSON, or Cookie header input",
      },
    };
  }
  return parseCookieHeader(header);
}

function parseCookieImportJson(input: string): { cookies: CookieImport[] } | { error: RpcResponse["error"] } | null {
  if (!input.startsWith("[") && !input.startsWith("{")) return null;
  try {
    const value = JSON.parse(input);
    const items = Array.isArray(value) ? value : Array.isArray(value?.cookies) ? value.cookies : null;
    if (!items) return { error: { code: "InvalidArgumentError", message: "cookies set --curl JSON must be an array or an object with a cookies array" } };
    const cookies = items.map(normalizeImportedCookie).filter((cookie: CookieImport | null): cookie is CookieImport => Boolean(cookie));
    if (cookies.length === 0) return { error: { code: "InvalidArgumentError", message: "cookies set --curl JSON did not contain valid cookies" } };
    return { cookies };
  } catch (error) {
    return { error: { code: "InvalidArgumentError", message: `cookies set --curl JSON parse failed: ${error instanceof Error ? error.message : String(error)}` } };
  }
}

function normalizeImportedCookie(value: any): CookieImport | null {
  if (!value || typeof value.name !== "string") return null;
  const cookie: CookieImport = {
    name: value.name,
    value: typeof value.value === "string" ? value.value : String(value.value ?? ""),
  };
  if (typeof value.path === "string") cookie.path = value.path;
  if (typeof value.domain === "string") cookie.domain = value.domain;
  if (typeof value.secure === "boolean") cookie.secure = value.secure;
  if (typeof value.httpOnly === "boolean") cookie.httpOnly = value.httpOnly;
  if (typeof value.sameSite === "string") cookie.sameSite = value.sameSite;
  if (typeof value.expirationDate === "number") cookie.expirationDate = value.expirationDate;
  if (typeof value.storeId === "string") cookie.storeId = value.storeId;
  if (typeof value.hostOnly === "boolean") cookie.hostOnly = value.hostOnly;
  return cookie;
}

function extractCookieHeader(input: string): string | null {
  const direct = cookieHeaderValue(input);
  if (direct) return direct;

  const tokens = splitCookieShellTokens(input);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if ((token === "-H" || token === "--header") && tokens[index + 1]) {
      const header = cookieHeaderValue(tokens[index + 1]);
      if (header) return header;
    }
    if ((token === "-b" || token === "--cookie") && tokens[index + 1]) {
      return tokens[index + 1];
    }
    const inlineHeader = token.match(/^(?:-H|--header)=(.+)$/);
    if (inlineHeader) {
      const header = cookieHeaderValue(inlineHeader[1]);
      if (header) return header;
    }
    const inlineCookie = token.match(/^(?:-b|--cookie)=(.+)$/);
    if (inlineCookie) return inlineCookie[1];
  }
  return null;
}

function cookieHeaderValue(value: string): string | null {
  const trimmed = value.trim();
  const match = /^cookie\s*:\s*(.+)$/i.exec(trimmed);
  if (match) return match[1].trim();
  if (!/^curl\s/i.test(trimmed) && trimmed.includes("=") && !trimmed.includes("\n")) return trimmed;
  return null;
}

function parseCookieHeader(header: string): { cookies: CookieImport[] } | { error: RpcResponse["error"] } {
  const cookies = header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const equals = part.indexOf("=");
      if (equals <= 0) return null;
      return { name: part.slice(0, equals).trim(), value: part.slice(equals + 1).trim() };
    })
    .filter((cookie): cookie is CookieImport => Boolean(cookie?.name));
  if (cookies.length === 0) return { error: { code: "InvalidArgumentError", message: "cookies set --curl Cookie header did not contain name=value pairs" } };
  return { cookies };
}

function splitCookieShellTokens(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  let escaped = false;
  for (const char of input) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === "\"") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (escaped) current += "\\";
  if (current) tokens.push(current);
  return tokens;
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

async function authCommand(args: string[], domainPolicy: DomainPolicyContext | null) {
  const [subcommand, name, ...rest] = args;
  if (subcommand === "save") return authSaveCommand(name, rest);
  if (subcommand === "login") return authLoginCommand(name, domainPolicy);
  if (subcommand === "login-inline") return authLoginInlineCommand(args.slice(1).join(" "), domainPolicy);
  if (subcommand === "list" || !subcommand) return authListCommand();
  if (subcommand === "show") return authShowCommand(name);
  if (subcommand === "delete") return authDeleteCommand(name);
  return { error: { code: "InvalidArgumentError", message: "auth requires save|login|list|show|delete" } };
}

async function authSaveCommand(name: string | undefined, args: string[]) {
  if (!name) return { error: { code: "InvalidArgumentError", message: "auth save requires <name>" } };
  const parsed = parseAuthSaveArgs(args);
  if ("error" in parsed) return parsed;
  const existing = await authProfiles();
  const now = new Date().toISOString();
  const profile: AuthProfile = {
    schemaVersion: 1,
    name,
    url: parsed.url,
    username: parsed.username,
    password: parsed.password,
    selectors: parsed.selectors,
    createdAt: existing[name]?.createdAt ?? now,
    updatedAt: now,
  };
  existing[name] = profile;
  await saveAuthProfiles(existing);
  return {
    text: `Saved auth profile ${name}`,
    profile: publicAuthProfile(profile),
    warnings: [authStorageWarning()],
  };
}

async function authLoginCommand(name: string | undefined, domainPolicy: DomainPolicyContext | null) {
  if (!name) return { error: { code: "InvalidArgumentError", message: "auth login requires <name>" } };
  const profiles = await authProfiles();
  const profile = profiles[name];
  if (!profile) return { error: { code: "not_found", message: `No auth profile found: ${name}` } };
  return performAuthLogin(profile, domainPolicy, true);
}

async function authLoginInlineCommand(payload: string, domainPolicy: DomainPolicyContext | null) {
  if (!payload) return { error: { code: "InvalidArgumentError", message: "auth login-inline requires a profile payload" } };
  let profile: unknown;
  try {
    profile = JSON.parse(payload);
  } catch {
    return { error: { code: "InvalidArgumentError", message: "auth login-inline profile payload must be JSON" } };
  }
  if (!isAuthProfile(profile)) {
    return { error: { code: "InvalidArgumentError", message: "auth login-inline profile payload is invalid" } };
  }
  return performAuthLogin(profile, domainPolicy, false);
}

async function performAuthLogin(
  profile: AuthProfile,
  domainPolicy: DomainPolicyContext | null,
  includeStorageWarning: boolean,
) {
  if (domainPolicy?.enabled) {
    const domainError = domainPolicyErrorForUrl(profile.url, domainPolicy);
    if (domainError) return { error: domainError };
  }

  const opened = await openCommand([profile.url], "open");
  if ("error" in opened) return opened;
  const username = await fillLocator(selectorToLocator(profile.selectors.username), profile.username);
  if ("error" in username) return username;
  const password = await fillLocator(selectorToLocator(profile.selectors.password), profile.password);
  if ("error" in password) return password;
  const submit = await clickLocator(selectorToLocator(profile.selectors.submit));
  if ("error" in submit) return submit;
  return {
    text: `Logged in with auth profile ${profile.name}`,
    profile: publicAuthProfile(profile),
    results: {
      open: resultSummary(opened),
      username: resultSummary(username),
      password: resultSummary(password),
      submit: resultSummary(submit),
    },
    warnings: mergeWarnings((opened as any).warnings, includeStorageWarning ? authStorageWarning() : []),
  };
}

async function authListCommand() {
  const profiles = Object.values(await authProfiles()).map(publicAuthProfile);
  const rows = profiles.map((profile) => `${profile.name} ${profile.url}`).join("\n");
  return {
    text: rows || "No auth profiles saved",
    profiles,
    warnings: [authStorageWarning()],
  };
}

async function authShowCommand(name: string | undefined) {
  if (!name) return { error: { code: "InvalidArgumentError", message: "auth show requires <name>" } };
  const profile = (await authProfiles())[name];
  if (!profile) return { error: { code: "not_found", message: `No auth profile found: ${name}` } };
  return {
    text: `${profile.name} ${profile.url}`,
    profile: publicAuthProfile(profile),
    warnings: [authStorageWarning()],
  };
}

async function authDeleteCommand(name: string | undefined) {
  if (!name) return { error: { code: "InvalidArgumentError", message: "auth delete requires <name>" } };
  const profiles = await authProfiles();
  const existed = Boolean(profiles[name]);
  delete profiles[name];
  await saveAuthProfiles(profiles);
  return {
    text: existed ? `Deleted auth profile ${name}` : `No auth profile found: ${name}`,
    deleted: existed,
    warnings: [authStorageWarning()],
  };
}

function parseAuthSaveArgs(args: string[]):
  | { url: string; username: string; password: string; selectors: AuthSelectors }
  | { error: Record<string, unknown> } {
  const values: Record<string, string> = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--password-stdin") {
      return {
        error: {
          code: "InvalidArgumentError",
          message: "auth save --password-stdin must be expanded by the CLI before extension dispatch; run `pire-browser auth save ... --password-stdin` and pipe the password on stdin",
          data: { feature: "auth --password-stdin", status: "cli_only" },
        },
      };
    }
    if (
      [
        "--url",
        "--username",
        "--password",
        "--username-selector",
        "--password-selector",
        "--submit-selector",
      ].includes(arg)
    ) {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        return { error: { code: "InvalidArgumentError", message: `${arg} requires a value` } };
      }
      values[arg] = value;
      index += 1;
      continue;
    }
    return { error: { code: "InvalidArgumentError", message: `unsupported auth save option: ${arg}` } };
  }
  if (!values["--url"]) return { error: { code: "InvalidArgumentError", message: "auth save requires --url <url>" } };
  if (!/^https?:\/\//.test(values["--url"])) {
    return { error: { code: "InvalidArgumentError", message: "auth save --url must be an http(s) URL" } };
  }
  if (!values["--username"]) return { error: { code: "InvalidArgumentError", message: "auth save requires --username <user>" } };
  if (!values["--password"]) return { error: { code: "InvalidArgumentError", message: "auth save requires --password <pass>" } };
  return {
    url: values["--url"],
    username: values["--username"],
    password: values["--password"],
    selectors: {
      username: values["--username-selector"] ?? DEFAULT_AUTH_SELECTORS.username,
      password: values["--password-selector"] ?? DEFAULT_AUTH_SELECTORS.password,
      submit: values["--submit-selector"] ?? DEFAULT_AUTH_SELECTORS.submit,
    },
  };
}

async function authProfiles(): Promise<Record<string, AuthProfile>> {
  const stored = await browser.storage.local.get(AUTH_STORAGE_KEY);
  const raw = stored?.[AUTH_STORAGE_KEY];
  if (!raw || typeof raw !== "object") return {};
  const profiles: Record<string, AuthProfile> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (isAuthProfile(value)) profiles[name] = value;
  }
  return profiles;
}

async function saveAuthProfiles(profiles: Record<string, AuthProfile>) {
  await browser.storage.local.set({ [AUTH_STORAGE_KEY]: profiles });
}

function isAuthProfile(value: unknown): value is AuthProfile {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, any>;
  return (
    candidate.schemaVersion === 1 &&
    typeof candidate.name === "string" &&
    typeof candidate.url === "string" &&
    typeof candidate.username === "string" &&
    typeof candidate.password === "string" &&
    typeof candidate.selectors?.username === "string" &&
    typeof candidate.selectors?.password === "string" &&
    typeof candidate.selectors?.submit === "string"
  );
}

function publicAuthProfile(profile: AuthProfile) {
  return {
    name: profile.name,
    url: profile.url,
    username: profile.username,
    selectors: profile.selectors,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

function authStorageWarning() {
  return bestEffortWarning(
    "auth",
    "Legacy extension-storage auth profiles live in the managed Firefox profile. Use the normal CLI `auth save` / `auth login` path for the encrypted local auth vault."
  );
}

function resultSummary(result: Record<string, unknown>) {
  return { text: typeof result.text === "string" ? result.text : "ok" };
}

async function stateCommand(args: string[]) {
  const [subcommand, ...rest] = args;
  if (subcommand === "export") return stateExportCommand();
  if (subcommand === "import") return stateImportCommand(rest.join(" "));
  return notAvailable("state", "Only `state save` and `state load` are implemented by the pire-browser CLI; other state commands are not available on the Firefox WebExtension backend yet.");
}

async function stateExportCommand() {
  const tab = await targetTab();
  const context = activeOriginContext(tab);
  if ("error" in context) return context;
  await waitForTabComplete(tab.tabId, 10000).catch(() => undefined);
  const cookies = await browser.cookies.getAll({ url: context.url });
  const storage = await stateStorageForTab(tab.tabId);
  if ("error" in storage) return storage;
  return {
    text: `Exported active-origin state for ${context.origin}`,
    source: context,
    cookies,
    localStorage: storage.localStorage,
    sessionStorage: storage.sessionStorage,
  };
}

async function stateImportCommand(payload: string) {
  const parsed = parseStatePayload(payload);
  if ("error" in parsed) return parsed;
  const state = parsed.state;
  const tab = await targetTab();
  const context = activeOriginContext(tab);
  if ("error" in context) return context;
  if (context.origin !== state.source.origin) {
    const displayUrl = displayUrlWithoutQueryOrFragment(state.source.url) || state.source.origin;
    return {
      error: {
        code: "InvalidArgumentError",
        message: `state load origin mismatch: active page is ${context.origin} but state file is for ${state.source.origin}; open ${displayUrl} first or load into a non-live --session-name profile`,
      },
    };
  }

  await waitForTabComplete(tab.tabId, 10000).catch(() => undefined);
  const existingCookies = await browser.cookies.getAll({ url: context.url });
  await Promise.all(existingCookies.map((cookie: any) => browser.cookies.remove({ url: cookieUrl(cookie), name: cookie.name })));

  let cookiesSet = 0;
  let cookiesSkipped = 0;
  for (const cookie of state.cookies ?? []) {
    if (await restoreCookie(context.url, cookie)) cookiesSet += 1;
    else cookiesSkipped += 1;
  }

  const storage = await importStateStorage(tab.tabId, state.localStorage ?? {}, state.sessionStorage ?? {});
  if ("error" in storage) return storage;
  await browser.tabs.reload(tab.tabId);
  await waitForTabComplete(tab.tabId, 10000);
  const warnings =
    cookiesSkipped > 0
      ? [bestEffortWarning("state load", `Skipped ${cookiesSkipped} cookie(s) whose metadata Firefox would not restore for the active origin.`)]
      : [];
  return {
    text: `Imported active-origin state for ${context.origin}`,
    source: context,
    cookiesSet,
    localStorageKeys: storage.localStorageKeys,
    sessionStorageKeys: storage.sessionStorageKeys,
    reloaded: true,
    warnings,
  };
}

function activeOriginContext(tab: TabRecord): { url: string; origin: string } | { error: Record<string, unknown> } {
  try {
    const url = new URL(tab.url ?? "");
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { error: { code: "InvalidArgumentError", message: "state save/load requires an active http(s) page" } };
    }
    return { url: tab.url ?? url.href, origin: url.origin };
  } catch {
    return { error: { code: "InvalidArgumentError", message: "state save/load requires an active page with a valid URL" } };
  }
}

function parseStatePayload(payload: string): { state: ActiveOriginStatePayload } | { error: Record<string, unknown> } {
  let state: ActiveOriginStatePayload;
  try {
    state = JSON.parse(payload) as ActiveOriginStatePayload;
  } catch {
    return { error: { code: "InvalidArgumentError", message: "state load requires a valid JSON state file" } };
  }
  if (state.schemaVersion !== 1 || state.tool !== "pire-browser" || state.kind !== "active-origin-state") {
    return { error: { code: "InvalidArgumentError", message: "state load requires a pire-browser active-origin-state schemaVersion 1 file" } };
  }
  if (!state.source?.url || !state.source?.origin) {
    return { error: { code: "InvalidArgumentError", message: "state load requires source.url and source.origin" } };
  }
  if (!/^https?:\/\//.test(state.source.url) || !/^https?:\/\//.test(state.source.origin)) {
    return { error: { code: "InvalidArgumentError", message: "state load requires an http(s) source URL and origin" } };
  }
  return { state };
}

function displayUrlWithoutQueryOrFragment(url: string): string {
  const index = url.search(/[?#]/);
  return index >= 0 ? url.slice(0, index) : url;
}

async function stateStorageForTab(tabId: number) {
  try {
    const response = await sendFrame(tabId, 0, { type: "state_export_storage" });
    return {
      localStorage: response.localStorage ?? {},
      sessionStorage: response.sessionStorage ?? {},
    };
  } catch (error) {
    return { error: { code: "command_failed", message: `Failed to read active-origin storage: ${error instanceof Error ? error.message : String(error)}` } };
  }
}

async function importStateStorage(tabId: number, localStorage: Record<string, string>, sessionStorage: Record<string, string>) {
  try {
    const response = await sendFrame(tabId, 0, {
      type: "state_import_storage",
      localStorage,
      sessionStorage,
    });
    if (response?.error) return { error: response.error };
    return {
      localStorageKeys: response.localStorageKeys ?? Object.keys(localStorage).length,
      sessionStorageKeys: response.sessionStorageKeys ?? Object.keys(sessionStorage).length,
    };
  } catch (error) {
    return { error: { code: "command_failed", message: `Failed to write active-origin storage: ${error instanceof Error ? error.message : String(error)}` } };
  }
}

async function restoreCookie(url: string, cookie: any): Promise<boolean> {
  if (!cookie || typeof cookie.name !== "string") return false;
  const base: Record<string, unknown> = {
    url,
    name: cookie.name,
    value: typeof cookie.value === "string" ? cookie.value : "",
  };
  const withMetadata: Record<string, unknown> = { ...base };
  if (typeof cookie.path === "string") withMetadata.path = cookie.path;
  if (typeof cookie.secure === "boolean") withMetadata.secure = cookie.secure;
  if (typeof cookie.httpOnly === "boolean") withMetadata.httpOnly = cookie.httpOnly;
  if (typeof cookie.sameSite === "string" && cookie.sameSite !== "unspecified") withMetadata.sameSite = cookie.sameSite;
  if (typeof cookie.expirationDate === "number") withMetadata.expirationDate = cookie.expirationDate;
  if (typeof cookie.storeId === "string") withMetadata.storeId = cookie.storeId;
  if (cookie.hostOnly === false && typeof cookie.domain === "string") withMetadata.domain = cookie.domain;

  for (const details of [withMetadata, base]) {
    try {
      await browser.cookies.set(details);
      return true;
    } catch {
      // Retry with less metadata; some cookie attributes are Firefox/profile dependent.
    }
  }
  return false;
}

async function clipboardCommand(args: string[]) {
  const [subcommand, ...rest] = args;
  if (subcommand === "read") {
    const read = await readClipboardText();
    if ("error" in read) return read;
    return { text: read.text, value: read.text, length: read.text.length };
  }
  if (subcommand === "write") {
    if (rest.length === 0) {
      return { error: { code: "InvalidArgumentError", message: "clipboard write requires <text>" } };
    }
    const text = rest.join(" ");
    const written = await writeClipboardText(text);
    if ("error" in written) return written;
    return { text: `Wrote ${text.length} character(s) to clipboard`, length: text.length };
  }
  if (subcommand === "copy") {
    const selection = await selectedTextFromActiveTab();
    if (!selection?.text) {
      return { error: { code: "InvalidArgumentError", message: "clipboard copy requires a non-empty current selection" } };
    }
    const written = await writeClipboardText(selection.text);
    if ("error" in written) return written;
    return {
      text: `Copied ${selection.text.length} character(s) from selection`,
      length: selection.text.length,
      warnings: [
        bestEffortWarning(
          "clipboard copy",
          "Copied the current page selection through the Firefox extension clipboard API; native Ctrl+C and custom page clipboard handlers were not invoked."
        ),
      ],
      dialogs: selection.dialogs ?? [],
    };
  }
  if (subcommand === "paste") {
    const read = await readClipboardText();
    if ("error" in read) return read;
    const pasted = await pasteTextIntoFocusedFrame(read.text);
    if (!pasted) {
      return {
        error: {
          code: "InvalidArgumentError",
          message: "clipboard paste requires a focused editable element; click or focus an input, textarea, or contenteditable target first",
        },
      };
    }
    return {
      text: `Pasted ${read.text.length} character(s) into focused element`,
      length: read.text.length,
      warnings: [
        bestEffortWarning(
          "clipboard paste",
          "Inserted clipboard text through the Firefox extension; native Ctrl+V and custom page clipboard handlers were not invoked."
        ),
      ],
      dialogs: pasted.dialogs ?? [],
    };
  }
  return { error: { code: "InvalidArgumentError", message: "clipboard requires read|write|copy|paste" } };
}

async function readClipboardText(): Promise<{ text: string } | { error: Record<string, unknown> }> {
  if (!navigator.clipboard?.readText) {
    return notAvailable("clipboard read", "Firefox did not expose navigator.clipboard.readText to the extension context.");
  }
  try {
    return { text: await navigator.clipboard.readText() };
  } catch (error) {
    return {
      error: {
        code: "ClipboardError",
        message: `Failed to read clipboard text: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

async function writeClipboardText(text: string): Promise<{ ok: true } | { error: Record<string, unknown> }> {
  if (!navigator.clipboard?.writeText) {
    return notAvailable("clipboard write", "Firefox did not expose navigator.clipboard.writeText to the extension context.");
  }
  try {
    await navigator.clipboard.writeText(text);
    return { ok: true };
  } catch (error) {
    return {
      error: {
        code: "ClipboardError",
        message: `Failed to write clipboard text: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

async function selectedTextFromActiveTab(): Promise<ClipboardFrameResult | null> {
  const tab = await targetTab();
  const responses = await clipboardFrameResponses(tab.tabId, { type: "clipboard_selection" });
  const withText = responses.filter((response) => typeof response.text === "string" && response.text.length > 0);
  return withText.find((response) => response.focused) ?? withText[0] ?? null;
}

async function pasteTextIntoFocusedFrame(text: string): Promise<ClipboardFrameResult | null> {
  const tab = await targetTab();
  const responses = await clipboardFrameResponses(tab.tabId, { type: "clipboard_paste", text });
  return responses.find((response) => response.pasted) ?? null;
}

async function clipboardFrameResponses(tabId: number, message: Record<string, unknown>): Promise<ClipboardFrameResult[]> {
  const frames = await frameIdsForTab(tabId);
  const responses: ClipboardFrameResult[] = [];
  for (const frameId of frames) {
    try {
      const response = (await sendFrame(tabId, frameId, message)) as ClipboardFrameResult;
      if (response?.handled || response?.pasted || response?.text) responses.push(response);
    } catch {
      // Cross-origin or restricted frames can reject extension messages.
    }
  }
  return responses;
}

async function frameIdsForTab(tabId: number): Promise<number[]> {
  const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => [{ frameId: 0 }]);
  return frames.map((frame: any) => frame.frameId).filter((frameId: unknown): frameId is number => typeof frameId === "number");
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
    const record = markControlledPage(rememberTab(created));
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

async function snapshotTab(
  tabId: number,
  selector?: string,
  depth?: number,
  frameId?: number,
  cursorInteractive = false
): Promise<FrameSnapshot[]> {
  const frames = await framesForScope(tabId, frameId);
  const out: FrameSnapshot[] = [];
  for (const frame of frames) {
    try {
      const snapshot = await sendFrame(tabId, frame.frameId, { type: "snapshot", selector, depth, cursorInteractive });
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

async function findInTab(tabId: number, locator: Locator, frameId?: number): Promise<FrameSnapshot[]> {
  const frames = await framesForScope(tabId, frameId);
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

async function framesForScope(tabId: number, frameId?: number): Promise<any[]> {
  const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => [{ frameId: 0 }]);
  if (typeof frameId !== "number") return frames;
  const frame = frames.find((candidate: any) => candidate.frameId === frameId);
  return frame ? [frame] : [{ frameId, opaque: true, url: undefined }];
}

function selectedFrameIdForTab(tabId: number): number | undefined {
  return selectedFramesByTabId.get(tabId)?.frameId;
}

function targetFrameIdForTab(tabId: number, explicitFrameId?: number): number | undefined {
  return typeof explicitFrameId === "number" ? explicitFrameId : selectedFrameIdForTab(tabId);
}

async function childFrameForTarget(
  tabId: number,
  parentFrameId: number,
  target: Record<string, unknown>
): Promise<{ frameId: number; url?: string } | { error: RpcResponse["error"] }> {
  const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => []);
  const childFrames = frames.filter((frame: any) => frame.parentFrameId === parentFrameId);
  const urls = frameUrlCandidates(target);
  const matches = urls.length
    ? childFrames.filter((frame: any) => urls.some((url) => frameUrlsMatch(frame.url, url)))
    : childFrames;
  if (matches.length === 0) {
    return {
      error: {
        code: "not_found",
        message: "No child frame matched the selected iframe; rerun snapshot and try the frame ref again",
      },
    };
  }
  if (matches.length > 1) {
    return {
      error: {
        code: "ambiguous_locator",
        message: `${matches.length} child frames matched the selected iframe URL`,
      },
    };
  }
  const frame = matches[0] as any;
  return { frameId: frame.frameId, url: frame.url };
}

async function childFrameForUrlTarget(
  tabId: number,
  parentFrameId: number,
  target: string
): Promise<{ frameId: number; url?: string } | { error: RpcResponse["error"] }> {
  const frames = await browser.webNavigation.getAllFrames({ tabId }).catch(() => []);
  const childFrames = frames.filter((frame: any) => frame.parentFrameId === parentFrameId);
  const matches = childFrames.filter((frame: any) => frameUrlMatchesTarget(frame.url, target));
  if (matches.length === 0) {
    return {
      error: {
        code: "not_found",
        message: `No child frame matched URL: ${target}`,
      },
    };
  }
  if (matches.length > 1) {
    return {
      error: {
        code: "ambiguous_locator",
        message: `${matches.length} child frames matched URL: ${target}`,
      },
    };
  }
  const frame = matches[0] as any;
  return { frameId: frame.frameId, url: frame.url };
}

function frameUrlCandidates(target: Record<string, unknown>): string[] {
  return [target.frameUrl, target.href]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map(normalizeFrameUrl)
    .filter((value): value is string => Boolean(value));
}

function normalizeFrameUrl(value: string): string | undefined {
  try {
    return new URL(value).href;
  } catch {
    return undefined;
  }
}

function frameUrlsMatch(left: unknown, right: string) {
  if (typeof left !== "string") return false;
  const normalized = normalizeFrameUrl(left);
  return normalized === right;
}

function frameUrlMatchesTarget(frameUrl: unknown, target: string) {
  if (typeof frameUrl !== "string" || !frameUrl) return false;
  const normalizedFrameUrl = normalizeFrameUrl(frameUrl) ?? frameUrl;
  const normalizedTarget = normalizeFrameUrl(target);
  if (normalizedTarget) return normalizedFrameUrl === normalizedTarget;
  return normalizedFrameUrl.includes(target) || frameUrl.includes(target);
}

function looksLikeFrameUrlTarget(target: string) {
  return Boolean(normalizeFrameUrl(target)) || /^(about|data|blob|file):/i.test(target) || target.includes("://");
}

async function sendFrame(
  tabId: number,
  frameId: number | undefined,
  message: Record<string, unknown>,
  behavior: { staleOnFrameRoutingError?: boolean } = {}
) {
  const target = typeof frameId === "number" ? { frameId } : undefined;
  try {
    const response = await browser.tabs.sendMessage(tabId, message, target);
    rememberDialogs(tabId, response?.dialogs);
    return response;
  } catch (error) {
    if (behavior.staleOnFrameRoutingError && typeof frameId === "number" && isFrameRoutingError(error)) {
      return {
        error: {
          code: "ref_stale",
          message: `Frame ${frameId} is not available; run snapshot or find again`,
        },
        dialogs: [],
      };
    }
    throw error;
  }
}

function rememberDialogs(tabId: number, dialogs: unknown) {
  if (!Array.isArray(dialogs) || dialogs.length === 0) return;
  const existing = recentDialogsByTabId.get(tabId) ?? [];
  const records = dialogs.filter(isDialogRecord);
  if (!records.length) return;
  recentDialogsByTabId.set(tabId, [...existing, ...records].slice(-10));
}

function isDialogRecord(value: unknown): value is DialogRecord {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.type === "alert" || candidate.type === "confirm" || candidate.type === "prompt") &&
    typeof candidate.message === "string" &&
    typeof candidate.at === "number"
  );
}

function isFrameRoutingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /frame.*not found|receiving end does not exist|could not establish connection|no matching message handler/i.test(message);
}

function parseFind(args: string[]):
  | { locator: Locator; action?: string; text?: string }
  | { error: Record<string, string> } {
  const [kind, ...rest] = args;
  let locator: Locator | undefined;
  const index = Number(valueAfter(rest, "--index") ?? "0");
  const exact = rest.includes("--exact");
  if (kind === "role") {
    const role = rest[0];
    if (!role) return { error: { code: "invalid_args", message: "find role requires <role>" } };
    locator = { kind: "role", role, name: valueAfter(rest, "--name"), index, exact };
    const tail = actionTail(rest.slice(1), ["--name", "--index"], ["--exact"]);
    if (tail[0]) return { locator, action: tail[0], text: tail.slice(1).join(" ") };
  } else if (kind === "label" || kind === "text" || kind === "placeholder" || kind === "alt" || kind === "title") {
    const text = rest[0];
    if (!text) return { error: { code: "invalid_args", message: `find ${kind} requires <text>` } };
    locator = { kind, text, index, exact } as Locator;
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
    ...response,
    text: response?.text ?? "ok",
    warnings: response?.warnings ?? [],
    dialogs: response?.dialogs ?? [],
  };
}

async function waitForUrl(pattern: string, timeout: number) {
  const tab = await targetTab();
  const matches = (url?: string) => Boolean(url && globToRegExp(pattern).test(url));
  if (matches(tab.url)) return { text: `URL matched ${pattern}` };
  return new Promise<Record<string, unknown>>((resolve) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      clearInterval(poll);
      browser.tabs.onUpdated.removeListener(listener);
    };
    const settle = (result: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const checkCurrent = async () => {
      const current = await browser.tabs.get(tab.tabId).catch(() => null);
      if (matches(current?.url)) settle({ text: `URL matched ${pattern}` });
    };
    const listener = (tabId: number, changeInfo: any, updatedTab: any) => {
      if (tabId === tab.tabId && matches(changeInfo.url ?? updatedTab.url)) {
        settle({ text: `URL matched ${pattern}` });
      }
    };
    const timer = setTimeout(() => {
      settle({ error: { code: "timeout", message: `Timed out waiting for URL: ${pattern}` } });
    }, timeout);
    const poll = setInterval(() => void checkCurrent(), 100);
    browser.tabs.onUpdated.addListener(listener);
    void checkCurrent();
  });
}

function notAvailable(feature: string, message: string) {
  return {
    error: {
      code: "NotAvailableError",
      message,
      data: { feature, status: "not_supported" },
    },
  };
}

function bestEffortResult(text: string, feature: string, message: string) {
  return {
    text,
    warnings: [bestEffortWarning(feature, message)],
  };
}

function bestEffortWarning(feature: string, message: string): WarningObject {
  return structuredWarning("BEST_EFFORT_FIREFOX_GAP", feature, message);
}

function structuredWarning(code: string, feature: string, message: string, extra: Record<string, unknown> = {}): WarningObject {
  return { ...extra, code, feature, message };
}

function mergeWarnings(...groups: unknown[]) {
  return groups.flatMap((group) => (Array.isArray(group) ? group : group ? [group] : []));
}

async function prepareLargeResult(result: Record<string, unknown>) {
  normalizeResultWarnings(result);
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

function normalizeResultWarnings(result: Record<string, unknown>) {
  if (!("warnings" in result)) return;
  result.warnings = normalizeWarnings(result.warnings);
}

function normalizeWarnings(value: unknown): WarningObject[] {
  const warnings = Array.isArray(value) ? value : value == null ? [] : [value];
  return warnings.map((warning) => normalizeWarning(warning));
}

function normalizeWarning(warning: unknown): WarningObject {
  if (warning && typeof warning === "object") {
    const candidate = warning as Record<string, unknown>;
    if (
      typeof candidate.code === "string" &&
      typeof candidate.feature === "string" &&
      typeof candidate.message === "string"
    ) {
      return candidate as WarningObject;
    }
    const message = typeof candidate.message === "string" ? candidate.message : JSON.stringify(candidate);
    return structuredWarning(
      typeof candidate.code === "string" ? candidate.code : warningCodeForMessage(message),
      typeof candidate.feature === "string" ? candidate.feature : warningFeatureForMessage(message),
      message,
      candidate
    );
  }
  const message = String(warning);
  return structuredWarning(warningCodeForMessage(message), warningFeatureForMessage(message), message);
}

function warningCodeForMessage(message: string) {
  if (message.includes("tab is already inspectable") || message.includes("tab is inspectable")) {
    return "NAVIGATION_RECOVERED";
  }
  return "COMMAND_WARNING";
}

function warningFeatureForMessage(message: string) {
  if (message.includes("tab is already inspectable") || message.includes("tab is inspectable")) {
    return "open";
  }
  return "runtime";
}

async function activeTab(): Promise<any | undefined> {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function targetTab(): Promise<TabRecord> {
  await reconcileTabs();
  const active = await activeTab();
  if (active?.id) return markControlledPage(rememberTab(active));
  const first = Array.from(tabsByAgentId.values()).find((tab) => !tab.closed);
  if (first) return markControlledPage(first);
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
  markControlledPage(page);
  await browser.windows.update(page.windowId, { focused: true });
  await browser.tabs.update(page.tabId, { active: true });
}

function markControlledPage<T extends PageRecord>(page: T): T {
  page.controlled = true;
  return page;
}

function scheduleControlledClose() {
  if (controlledCloseScheduled) return;
  controlledCloseScheduled = true;
  setTimeout(() => {
    controlledCloseScheduled = false;
    void closeControlledSurfaces().catch((error) => {
      console.error("[pire-browser] controlled close failed", error);
    });
  }, CLOSE_TEARDOWN_DELAY_MS);
}

async function closeControlledSurfaces() {
  await reconcileTabs();
  const liveTabs = await browser.tabs.query({});
  const controlledTabIds = new Set(
    Array.from(tabsByBrowserId.values())
      .filter((tab) => tab.controlled && !tab.closed)
      .map((tab) => tab.tabId)
  );
  const active = await activeTab();
  const fallbackTabId = typeof active?.id === "number" ? active.id : undefined;
  const plan = planControlledClose(liveTabs, controlledTabIds, fallbackTabId);

  if (plan.windowIds.length > 0) {
    disconnectNativeForControlledClose();
  }
  for (const windowId of plan.windowIds) {
    await browser.windows.remove(windowId);
  }
  if (plan.tabIds.length > 0) {
    await browser.tabs.remove(plan.tabIds);
  }
  for (const tabId of [...plan.tabIds, ...tabsInWindows(liveTabs, plan.windowIds)]) {
    const record = tabsByBrowserId.get(tabId);
    if (record) record.closed = true;
  }
}

function planControlledClose(liveTabs: any[], controlledTabIds: Set<number>, fallbackTabId?: number): ControlledClosePlan {
  const tabsByWindow = new Map<number, any[]>();
  for (const tab of liveTabs) {
    if (typeof tab.id !== "number" || typeof tab.windowId !== "number") continue;
    const tabs = tabsByWindow.get(tab.windowId) ?? [];
    tabs.push(tab);
    tabsByWindow.set(tab.windowId, tabs);
  }

  const windowIds: number[] = [];
  const tabIds: number[] = [];
  for (const [windowId, windowTabs] of tabsByWindow) {
    const controlledTabs = windowTabs.filter((tab) => controlledTabIds.has(tab.id));
    if (controlledTabs.length === 0) continue;
    if (windowTabs.every((tab) => controlledTabIds.has(tab.id))) {
      windowIds.push(windowId);
    } else {
      tabIds.push(...controlledTabs.map((tab) => tab.id));
    }
  }

  if (windowIds.length === 0 && tabIds.length === 0 && typeof fallbackTabId === "number") {
    tabIds.push(fallbackTabId);
  }
  return { windowIds, tabIds };
}

function disconnectNativeForControlledClose() {
  nativeReconnectEnabled = false;
  try {
    port?.disconnect?.();
  } catch {
    // The browser may already be tearing down the native messaging port.
  }
}

function tabsInWindows(liveTabs: any[], windowIds: number[]) {
  const windowIdSet = new Set(windowIds);
  return liveTabs
    .filter((tab) => typeof tab.id === "number" && typeof tab.windowId === "number" && windowIdSet.has(tab.windowId))
    .map((tab) => tab.id as number);
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
    void postSessionEvent("tabs_changed", {});
  });
  browser.tabs.onRemoved.addListener((tabId: number) => {
    const record = tabsByBrowserId.get(tabId);
    if (record) record.closed = true;
    lastSnapshotTextByTabId.delete(tabId);
    clearNetworkStateForTab(tabId);
    void postSessionEvent("tabs_changed", {});
  });
  browser.tabs.onUpdated.addListener((_tabId: number, _change: any, tab: any) => {
    if (typeof tab.id === "number" && typeof tab.windowId === "number") rememberTab(tab);
    void postSessionEvent("tabs_changed", {});
  });
  browser.tabs.onActivated.addListener(() => void postSessionEvent("focused", {}));
  browser.windows.onFocusChanged.addListener(() => void postSessionEvent("focused", {}));
}

function registerHeaderListener() {
  if (!browser.webRequest?.onBeforeSendHeaders?.addListener) return;
  browser.webRequest.onBeforeSendHeaders.addListener(
    applyScopedRequestHeaders,
    { urls: ["<all_urls>"] },
    ["blocking", "requestHeaders"]
  );
}

function registerAuthListener() {
  if (!browser.webRequest?.onAuthRequired?.addListener) return;
  browser.webRequest.onAuthRequired.addListener(
    applyBasicAuthCredentials,
    { urls: ["<all_urls>"] },
    ["blocking"]
  );
}

function registerNetworkRouteListener() {
  if (!browser.webRequest?.onBeforeRequest?.addListener) return;
  browser.webRequest.onBeforeRequest.addListener(
    applyNetworkRoute,
    { urls: ["<all_urls>"] },
    ["blocking"]
  );
}

function registerNetworkActivityListeners() {
  if (!browser.webRequest?.onBeforeRequest?.addListener) return;
  try {
    browser.webRequest.onBeforeRequest.addListener(
      trackNetworkRequestStart,
      { urls: ["<all_urls>"] },
      ["requestBody", "blocking"]
    );
  } catch {
    try {
      browser.webRequest.onBeforeRequest.addListener(
        trackNetworkRequestStart,
        { urls: ["<all_urls>"] },
        ["requestBody"]
      );
    } catch {
      browser.webRequest.onBeforeRequest.addListener(
        trackNetworkRequestStart,
        { urls: ["<all_urls>"] }
      );
    }
  }
  browser.webRequest.onBeforeSendHeaders?.addListener?.(
    trackNetworkRequestHeaders,
    { urls: ["<all_urls>"] },
    ["requestHeaders"]
  );
  browser.webRequest.onHeadersReceived?.addListener?.(
    trackNetworkResponseHeaders,
    { urls: ["<all_urls>"] },
    ["responseHeaders"]
  );
  browser.webRequest.onCompleted?.addListener?.(
    trackNetworkRequestEnd,
    { urls: ["<all_urls>"] }
  );
  browser.webRequest.onErrorOccurred?.addListener?.(
    trackNetworkRequestEnd,
    { urls: ["<all_urls>"] }
  );
}

function trackNetworkRequestStart(details: any) {
  const tabId = typeof details?.tabId === "number" ? details.tabId : -1;
  if (tabId < 0 || shouldIgnoreNetworkActivity(details)) return {};
  const requestId = String(details.requestId ?? `${tabId}:${Date.now()}:${Math.random()}`);
  const now = Date.now();
  const routeMatch = networkRouteMatchesByRequestId.get(requestId);
  const requestBody = captureNetworkRequestBody(details);
  const record: NetworkActivityRecord = {
    requestId,
    tabId,
    url: typeof details.url === "string" ? details.url : undefined,
    type: typeof details.type === "string" ? details.type : undefined,
    method: typeof details.method === "string" ? details.method : undefined,
    frameId: typeof details.frameId === "number" ? details.frameId : undefined,
    parentFrameId: typeof details.parentFrameId === "number" ? details.parentFrameId : undefined,
    documentUrl: typeof details.documentUrl === "string" ? details.documentUrl : undefined,
    initiator: typeof details.originUrl === "string" ? details.originUrl : typeof details.initiator === "string" ? details.initiator : undefined,
    startedAt: now,
    active: true,
    routeId: routeMatch?.routeId,
    routeAction: routeMatch?.action,
    requestBody,
  };
  networkRequestsById.set(requestId, record);
  attachNetworkResponseBodyFilter(details, record);
  rememberNetworkRecord(tabId, requestId);
  const ids = networkRequestIdsByTabId.get(tabId) ?? new Set<string>();
  ids.add(requestId);
  networkRequestIdsByTabId.set(tabId, ids);
  lastNetworkActivityAtByTabId.set(tabId, now);
  return {};
}

function trackNetworkRequestHeaders(details: any) {
  rememberNetworkHeaders(details, "requestHeaders", details?.requestHeaders);
  return {};
}

function trackNetworkResponseHeaders(details: any) {
  rememberNetworkHeaders(details, "responseHeaders", details?.responseHeaders);
  return {};
}

function trackNetworkRequestEnd(details: any) {
  const requestId = String(details?.requestId ?? "");
  const record = requestId ? networkRequestsById.get(requestId) : undefined;
  const tabId = record?.tabId ?? (typeof details?.tabId === "number" ? details.tabId : -1);
  if (tabId < 0) return;
  const now = Date.now();
  if (requestId) {
    const current: NetworkActivityRecord = record ?? {
      requestId,
      tabId,
      url: typeof details.url === "string" ? details.url : undefined,
      type: typeof details.type === "string" ? details.type : undefined,
      method: typeof details.method === "string" ? details.method : undefined,
      startedAt: now,
    };
    current.statusCode = typeof details.statusCode === "number" ? details.statusCode : current.statusCode;
    current.statusLine = typeof details.statusLine === "string" ? details.statusLine : current.statusLine;
    current.fromCache = typeof details.fromCache === "boolean" ? details.fromCache : current.fromCache;
    current.error = typeof details.error === "string" ? details.error : current.error;
    const routeMatch = networkRouteMatchesByRequestId.get(requestId);
    current.routeId = routeMatch?.routeId ?? current.routeId;
    current.routeAction = routeMatch?.action ?? current.routeAction;
    current.completedAt = now;
    current.durationMs = Math.max(0, now - current.startedAt);
    current.active = false;
    networkRequestsById.set(requestId, current);
    rememberNetworkRecord(tabId, requestId);
    networkRequestIdsByTabId.get(tabId)?.delete(requestId);
  }
  lastNetworkActivityAtByTabId.set(tabId, now);
}

function rememberNetworkHeaders(details: any, field: "requestHeaders" | "responseHeaders", rawHeaders: any) {
  const requestId = String(details?.requestId ?? "");
  const tabId = typeof details?.tabId === "number" ? details.tabId : -1;
  if (!requestId || tabId < 0 || shouldIgnoreNetworkActivity(details)) return;
  const now = Date.now();
  const current: NetworkActivityRecord = networkRequestsById.get(requestId) ?? {
    requestId,
    tabId,
    url: typeof details.url === "string" ? details.url : undefined,
    type: typeof details.type === "string" ? details.type : undefined,
    method: typeof details.method === "string" ? details.method : undefined,
    frameId: typeof details.frameId === "number" ? details.frameId : undefined,
    parentFrameId: typeof details.parentFrameId === "number" ? details.parentFrameId : undefined,
    documentUrl: typeof details.documentUrl === "string" ? details.documentUrl : undefined,
    initiator: typeof details.originUrl === "string" ? details.originUrl : typeof details.initiator === "string" ? details.initiator : undefined,
    startedAt: now,
    active: true,
  };
  current[field] = sanitizeNetworkHeaders(rawHeaders);
  networkRequestsById.set(requestId, current);
  rememberNetworkRecord(tabId, requestId);
  lastNetworkActivityAtByTabId.set(tabId, now);
}

function attachNetworkResponseBodyFilter(details: any, record: NetworkActivityRecord) {
  if (!shouldCaptureNetworkResponseBody(details, record)) return;
  if (typeof browser.webRequest?.filterResponseData !== "function") return;
  let filter: any;
  try {
    filter = browser.webRequest.filterResponseData(record.requestId);
  } catch {
    return;
  }
  const state = {
    requestId: record.requestId,
    size: 0,
    text: "",
    truncated: false,
    decoder: new TextDecoder("utf-8"),
    finished: false,
  };
  filter.ondata = (event: any) => {
    try {
      appendNetworkResponseBodyChunk(state, event?.data);
      filter.write(event.data);
    } catch (error) {
      saveNetworkResponseBody(record.requestId, {
        kind: "error",
        error: truncate(errorMessage(error), 500),
      });
      safeDisconnectNetworkResponseFilter(filter, state);
    }
  };
  filter.onstop = () => {
    if (state.finished) return;
    state.finished = true;
    completeNetworkResponseBodyCapture(state);
    safeCloseNetworkResponseFilter(filter);
  };
  filter.onerror = (event: any) => {
    if (state.finished) return;
    state.finished = true;
    saveNetworkResponseBody(record.requestId, {
      kind: "error",
      error: truncate(errorMessage(event?.error ?? event), 500),
    });
    safeDisconnectNetworkResponseFilter(filter, state);
  };
}

function shouldCaptureNetworkResponseBody(details: any, record: NetworkActivityRecord) {
  if (record.routeAction === "abort" || record.routeAction === "mock") return false;
  const route = matchingNetworkRoute(details);
  if (route?.abort || route?.body !== undefined) return false;
  const url = typeof details?.url === "string" ? details.url : record.url ?? "";
  if (!/^https?:\/\//i.test(url)) return false;
  const type = String(details?.type ?? record.type ?? "").toLowerCase();
  return type === "xmlhttprequest" || type === "fetch" || type === "main_frame" || type === "sub_frame";
}

function appendNetworkResponseBodyChunk(state: { size: number; text: string; truncated: boolean; decoder: TextDecoder }, data: any) {
  const bytes = networkUploadBytes(data);
  if (!bytes) return;
  state.size += bytes.byteLength;
  if (state.text.length > MAX_NETWORK_RESPONSE_BODY_TEXT_LENGTH) {
    state.truncated = true;
    return;
  }
  const remaining = Math.max(0, (MAX_NETWORK_RESPONSE_BODY_TEXT_LENGTH + 512 - state.text.length) * 4);
  const displayBytes = remaining > 0 && bytes.byteLength > remaining ? bytes.slice(0, remaining) : bytes;
  state.truncated = state.truncated || displayBytes.byteLength < bytes.byteLength;
  state.text += state.decoder.decode(displayBytes, { stream: true });
}

function completeNetworkResponseBodyCapture(state: { requestId: string; size: number; text: string; truncated: boolean; decoder: TextDecoder }) {
  const current = networkRequestsById.get(state.requestId);
  if (!current) return;
  const tail = state.decoder.decode();
  const contentType = responseContentType(current.responseHeaders);
  const contentEncoding = networkHeaderValueByName(current.responseHeaders, "content-encoding")?.toLowerCase();
  if (contentEncoding && contentEncoding !== "identity") {
    saveNetworkResponseBody(state.requestId, {
      kind: "binary",
      size: state.size,
      mimeType: contentType,
      encoding: contentEncoding,
      text: `[${contentEncoding} response body omitted]`,
      redacted: true,
      ...(state.truncated ? { truncated: true } : {}),
    });
    return;
  }
  const text = state.text + tail;
  if (!isTextLikeNetworkResponse(contentType, text)) {
    saveNetworkResponseBody(state.requestId, {
      kind: "binary",
      size: state.size,
      mimeType: contentType,
      text: "[binary response body omitted]",
      redacted: true,
      ...(state.truncated ? { truncated: true } : {}),
    });
    return;
  }
  const sanitized = sanitizeNetworkBodyText(text);
  const display = truncateNetworkBodyValue(sanitized.text, MAX_NETWORK_RESPONSE_BODY_TEXT_LENGTH);
  saveNetworkResponseBody(state.requestId, {
    kind: "text",
    text: display.value,
    size: state.size,
    encoding: "utf-8",
    mimeType: contentType,
    ...(sanitized.redacted ? { redacted: true } : {}),
    ...(state.truncated || display.truncated ? { truncated: true } : {}),
  });
}

function saveNetworkResponseBody(requestId: string, body: NetworkBodyRecord) {
  const current = networkRequestsById.get(requestId);
  if (!current) return;
  current.responseBody = body;
  networkRequestsById.set(requestId, current);
}

function safeCloseNetworkResponseFilter(filter: any) {
  try {
    filter.close();
  } catch {
    safeDisconnectNetworkResponseFilter(filter);
  }
}

function safeDisconnectNetworkResponseFilter(filter: any, state?: { finished?: boolean }) {
  if (state) state.finished = true;
  try {
    filter.disconnect();
  } catch {
    try {
      filter.close();
    } catch {
      // Best effort: never let response-body diagnostics throw into the page load.
    }
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isTextLikeNetworkResponse(contentType: string | undefined, text: string) {
  const mime = (contentType ?? "").toLowerCase();
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/javascript" ||
    mime === "application/x-javascript" ||
    mime === "application/xml" ||
    mime === "application/xhtml+xml" ||
    mime === "application/x-www-form-urlencoded" ||
    mime === "application/graphql-response+json" ||
    mime === "application/ld+json" ||
    mime.endsWith("+json") ||
    mime.endsWith("+xml") ||
    mime === "image/svg+xml"
  ) {
    return true;
  }
  if (mime) return false;
  return looksLikeTextResponsePreview(text);
}

function looksLikeTextResponsePreview(text: string) {
  const sample = text.slice(0, 1000);
  if (!sample) return true;
  if (sample.includes("\u0000")) return false;
  let suspicious = 0;
  for (const char of sample) {
    const code = char.charCodeAt(0);
    if (char === "\uFFFD" || (code < 32 && char !== "\n" && char !== "\r" && char !== "\t")) {
      suspicious += 1;
    }
  }
  return suspicious / sample.length < 0.05;
}

function captureNetworkRequestBody(details: any): NetworkBodyRecord | undefined {
  const requestBody = details?.requestBody;
  if (!requestBody || typeof requestBody !== "object") return undefined;
  if (typeof requestBody.error === "string") {
    return { kind: "error", error: truncate(requestBody.error, 500) };
  }
  if (requestBody.formData && typeof requestBody.formData === "object") {
    return captureNetworkFormData(requestBody.formData);
  }
  if (Array.isArray(requestBody.raw)) {
    return captureRawNetworkBody(requestBody.raw);
  }
  return undefined;
}

function captureNetworkFormData(formData: Record<string, unknown>): NetworkBodyRecord {
  const fields: NetworkBodyField[] = [];
  let size = 0;
  let truncated = false;
  let redacted = false;
  for (const [name, rawValue] of Object.entries(formData)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      const text = typeof value === "string" ? value : value == null ? "" : String(value);
      size += utf8ByteLength(text);
      const sensitive = isSensitiveNetworkBodyName(name);
      const display = sensitive ? { value: "[REDACTED]", truncated: false } : truncateNetworkBodyValue(text, MAX_NETWORK_BODY_FIELD_VALUE_LENGTH);
      fields.push({
        name,
        value: display.value,
        ...(sensitive ? { redacted: true } : {}),
        ...(display.truncated ? { truncated: true } : {}),
      });
      redacted = redacted || sensitive;
      truncated = truncated || display.truncated;
      if (fields.length >= MAX_NETWORK_BODY_FIELDS) {
        truncated = true;
        break;
      }
    }
    if (fields.length >= MAX_NETWORK_BODY_FIELDS) break;
  }
  const text = truncateNetworkBodyValue(fields.map((field) => `${field.name}=${field.value}`).join("&"), MAX_NETWORK_BODY_TEXT_LENGTH);
  return {
    kind: "formData",
    fields,
    text: text.value,
    size,
    ...(redacted ? { redacted: true } : {}),
    ...(truncated || text.truncated ? { truncated: true } : {}),
  };
}

function captureRawNetworkBody(rawParts: any[]): NetworkBodyRecord | undefined {
  let size = 0;
  let text = "";
  let hasFile = false;
  let decodedTruncated = false;
  const decoder = new TextDecoder("utf-8");
  for (const part of rawParts) {
    if (part?.file) {
      hasFile = true;
      continue;
    }
    const bytes = networkUploadBytes(part?.bytes);
    if (!bytes) continue;
    size += bytes.byteLength;
    if (text.length <= MAX_NETWORK_BODY_TEXT_LENGTH) {
      const remaining = Math.max(0, (MAX_NETWORK_BODY_TEXT_LENGTH + 256 - text.length) * 4);
      const displayBytes = remaining > 0 && bytes.byteLength > remaining ? bytes.slice(0, remaining) : bytes;
      decodedTruncated = decodedTruncated || displayBytes.byteLength < bytes.byteLength;
      text += decoder.decode(displayBytes, { stream: true });
    } else {
      decodedTruncated = true;
    }
  }
  text += decoder.decode();
  if (!text && hasFile) {
    return {
      kind: "raw",
      text: "[file upload body omitted]",
      ...(size ? { size } : {}),
      redacted: true,
    };
  }
  if (!text) return size ? { kind: "raw", size } : undefined;
  const sanitized = sanitizeNetworkBodyText(text);
  const display = truncateNetworkBodyValue(sanitized.text, MAX_NETWORK_BODY_TEXT_LENGTH);
  return {
    kind: "raw",
    text: display.value,
    size,
    encoding: "utf-8",
    ...(sanitized.redacted || hasFile ? { redacted: true } : {}),
    ...(display.truncated || decodedTruncated || hasFile ? { truncated: true } : {}),
  };
}

function networkUploadBytes(bytes: any): Uint8Array | null {
  if (!bytes) return null;
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  if (ArrayBuffer.isView(bytes)) return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (Array.isArray(bytes)) return new Uint8Array(bytes);
  return null;
}

function sanitizeNetworkBodyText(text: string): { text: string; redacted?: boolean } {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const redacted = { value: false };
      const sanitized = redactSensitiveJsonValue(JSON.parse(text), undefined, redacted);
      return { text: JSON.stringify(sanitized), ...(redacted.value ? { redacted: true } : {}) };
    } catch {
      // Fall through to URL-encoded handling.
    }
  }
  if (looksLikeUrlEncodedBody(text)) {
    try {
      const params = new URLSearchParams(text);
      const output = new URLSearchParams();
      let redacted = false;
      params.forEach((value, name) => {
        if (isSensitiveNetworkBodyName(name)) {
          output.append(name, "[REDACTED]");
          redacted = true;
        } else {
          output.append(name, value);
        }
      });
      return { text: output.toString(), ...(redacted ? { redacted: true } : {}) };
    } catch {
      // Fall through to coarse sensitive-marker handling.
    }
  }
  if (containsSensitiveNetworkBodyMarker(text)) {
    return { text: "[REDACTED body contained sensitive-looking fields]", redacted: true };
  }
  return { text };
}

function redactSensitiveJsonValue(value: unknown, key: string | undefined, redacted: { value: boolean }): unknown {
  if (key && isSensitiveNetworkBodyName(key)) {
    redacted.value = true;
    return "[REDACTED]";
  }
  if (Array.isArray(value)) return value.map((item) => redactSensitiveJsonValue(item, undefined, redacted));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = redactSensitiveJsonValue(childValue, childKey, redacted);
    }
    return output;
  }
  return value;
}

function looksLikeUrlEncodedBody(text: string) {
  return /^[^=&\s]+=[\s\S]*/.test(text) && text.includes("=");
}

function containsSensitiveNetworkBodyMarker(text: string) {
  return /["']?(?:password|passwd|pwd|token|secret|credential|session|cookie|csrf|xsrf|jwt|api[_-]?key)["']?\s*[:=]/i.test(text);
}

function truncateNetworkBodyValue(value: string, max: number) {
  const truncated = value.length > max;
  return { value: truncate(value, max), truncated };
}

function utf8ByteLength(value: string) {
  try {
    return new TextEncoder().encode(value).byteLength;
  } catch {
    return value.length;
  }
}

function isSensitiveNetworkBodyName(name: string) {
  const lower = name.toLowerCase();
  return (
    lower === "password" ||
    lower === "passwd" ||
    lower === "pwd" ||
    lower.includes("password") ||
    lower.includes("passcode") ||
    lower.includes("token") ||
    lower.includes("secret") ||
    lower.includes("auth") ||
    lower.includes("credential") ||
    lower.includes("session") ||
    lower.includes("cookie") ||
    lower.includes("csrf") ||
    lower.includes("xsrf") ||
    lower.includes("jwt") ||
    lower.includes("api_key") ||
    lower.includes("api-key") ||
    lower.includes("apikey")
  );
}

function sanitizeNetworkHeaders(rawHeaders: any): NetworkHeaderRecord[] {
  if (!Array.isArray(rawHeaders)) return [];
  return rawHeaders
    .map((header: any) => sanitizeNetworkHeader(header))
    .filter((header): header is NetworkHeaderRecord => Boolean(header));
}

function sanitizeNetworkHeader(header: any): NetworkHeaderRecord | null {
  const name = typeof header?.name === "string" ? header.name : "";
  if (!name) return null;
  const value = networkHeaderValue(header);
  if (isSensitiveNetworkHeader(name)) {
    return { name, value: "[REDACTED]", redacted: true };
  }
  return { name, value: truncate(value, 1000) };
}

function networkHeaderValue(header: any) {
  if (typeof header?.value === "string") return header.value;
  if (typeof header?.binaryValue === "string") return "[binary]";
  return "";
}

function isSensitiveNetworkHeader(name: string) {
  const lower = name.toLowerCase();
  return (
    lower === "authorization" ||
    lower === "proxy-authorization" ||
    lower === "cookie" ||
    lower === "set-cookie" ||
    lower === "x-csrf-token" ||
    lower === "x-xsrf-token" ||
    lower === "x-auth-token" ||
    lower === "x-api-key" ||
    lower.includes("auth") ||
    lower.includes("session") ||
    lower.includes("token") ||
    lower.includes("secret") ||
    lower.includes("credential") ||
    lower.includes("csrf") ||
    lower.includes("xsrf") ||
    lower.includes("jwt") ||
    lower.includes("api-key") ||
    lower.includes("apikey")
  );
}

function rememberNetworkRecord(tabId: number, requestId: string) {
  const ids = networkRequestLogIdsByTabId.get(tabId) ?? [];
  if (!ids.includes(requestId)) ids.push(requestId);
  networkRequestLogIdsByTabId.set(tabId, ids);
  pruneNetworkLog(tabId);
}

function pruneNetworkLog(tabId: number) {
  const ids = networkRequestLogIdsByTabId.get(tabId);
  if (!ids) return;
  const activeIds = networkRequestIdsByTabId.get(tabId) ?? new Set<string>();
  while (ids.length > MAX_NETWORK_RECORDS_PER_TAB) {
    const index = ids.findIndex((id) => !activeIds.has(id));
    if (index < 0) break;
    const [removed] = ids.splice(index, 1);
    if (removed) {
      networkRequestsById.delete(removed);
      networkRouteMatchesByRequestId.delete(removed);
    }
  }
}

function clearNetworkStateForTab(tabId: number) {
  for (const id of networkRequestLogIdsByTabId.get(tabId) ?? []) {
    networkRequestsById.delete(id);
    networkRouteMatchesByRequestId.delete(id);
  }
  for (const id of networkRequestIdsByTabId.get(tabId) ?? []) {
    networkRequestsById.delete(id);
    networkRouteMatchesByRequestId.delete(id);
  }
  for (const [id, route] of Array.from(networkRoutes.entries())) {
    if (route.tabId === tabId) networkRoutes.delete(id);
  }
  networkHarRecordingStartedAtByTabId.delete(tabId);
  traceRecordingsByTabId.delete(tabId);
  profilerRecordingsByTabId.delete(tabId);
  stopVisualRecording(visualRecordingsByTabId.get(tabId), "tab_closed");
  visualRecordingsByTabId.delete(tabId);
  networkRequestLogIdsByTabId.delete(tabId);
  networkRequestIdsByTabId.delete(tabId);
  lastNetworkActivityAtByTabId.delete(tabId);
}

function shouldIgnoreNetworkActivity(details: any) {
  const type = String(details?.type ?? "").toLowerCase();
  return type === "websocket";
}

function applyNetworkRoute(details: any) {
  if (offlineModeEnabled && requestBelongsToManagedTab(details)) {
    rememberOfflineNetworkBlock(details);
    return { cancel: true };
  }
  const route = matchingNetworkRoute(details);
  if (!route) return {};
  const action = networkRouteAction(route);
  rememberNetworkRouteMatch(details, route, action);
  if (route.abort) return { cancel: true };
  if (route.body !== undefined) return { redirectUrl: networkRouteDataUrl(route) };
  return {};
}

function matchingNetworkRoute(details: any) {
  const tabId = typeof details?.tabId === "number" ? details.tabId : -1;
  if (tabId < 0 || shouldIgnoreNetworkActivity(details)) return undefined;
  const routes = Array.from(networkRoutes.values()).filter((route) => route.tabId === tabId);
  for (let index = routes.length - 1; index >= 0; index--) {
    const route = routes[index];
    if (!networkRouteUrlMatches(String(details?.url ?? ""), route.pattern)) continue;
    if (route.resourceTypes?.length && !route.resourceTypes.includes(normalizeNetworkType(details?.type))) continue;
    return route;
  }
  return undefined;
}

function requestBelongsToManagedTab(details: any) {
  const tabId = typeof details?.tabId === "number" ? details.tabId : -1;
  return tabId >= 0 && tabsByBrowserId.has(tabId);
}

function rememberNetworkRouteMatch(details: any, route: NetworkRouteRule, action: "continue" | "abort" | "mock") {
  const requestId = String(details?.requestId ?? "");
  if (!requestId) return;
  networkRouteMatchesByRequestId.set(requestId, { routeId: route.id, action });
  const record = networkRequestsById.get(requestId);
  if (record) {
    record.routeId = route.id;
    record.routeAction = action;
  }
}

function rememberOfflineNetworkBlock(details: any) {
  const requestId = String(details?.requestId ?? "");
  if (!requestId) return;
  networkRouteMatchesByRequestId.set(requestId, { routeId: "offline", action: "abort" });
  const record = networkRequestsById.get(requestId);
  if (record) {
    record.routeId = "offline";
    record.routeAction = "abort";
  }
}

function networkRouteDataUrl(route: NetworkRouteRule) {
  const contentType = route.contentType ?? inferRouteContentType(route.body) ?? "text/plain";
  const encoded = new TextEncoder().encode(route.body ?? "");
  return `data:${contentType};base64,${bytesToBase64(encoded)}`;
}

function networkRouteUrlMatches(url: string, pattern: string) {
  if (pattern === "*" || pattern === "**" || pattern === "<all_urls>") return true;
  return networkUrlMatches(url, pattern);
}

function applyScopedRequestHeaders(details: any) {
  const origin = safeOrigin(details?.url);
  const rules = origin ? headersByOrigin.get(origin) : undefined;
  const credentials = origin ? credentialsByOrigin.get(origin) : undefined;
  if (!rules?.length && !credentials) return {};
  const requestHeaders = Array.isArray(details.requestHeaders) ? [...details.requestHeaders] : [];
  for (const rule of rules ?? []) {
    upsertRequestHeader(requestHeaders, rule.name, rule.value);
  }
  if (credentials) {
    upsertRequestHeader(requestHeaders, "Authorization", basicAuthorizationValue(credentials));
  }
  rememberNetworkHeaders(details, "requestHeaders", requestHeaders);
  return { requestHeaders };
}

function upsertRequestHeader(requestHeaders: any[], name: string, value: string) {
  const existing = requestHeaders.find((header: any) => header?.name?.toLowerCase() === name.toLowerCase());
  if (existing) {
    existing.value = value;
  } else {
    requestHeaders.push({ name, value });
  }
}

function applyBasicAuthCredentials(details: any) {
  if (details?.isProxy === true) {
    return proxyCredentials
      ? {
          authCredentials: {
            username: proxyCredentials.username,
            password: proxyCredentials.password,
          },
        }
      : {};
  }
  const origin = safeOrigin(details?.url);
  const credentials = origin ? credentialsByOrigin.get(origin) : undefined;
  if (!credentials) return {};
  return {
    authCredentials: {
      username: credentials.username,
      password: credentials.password,
    },
  };
}

function basicAuthorizationValue(credentials: BasicCredentialRule) {
  const encoded = new TextEncoder().encode(`${credentials.username}:${credentials.password}`);
  return `Basic ${bytesToBase64(encoded)}`;
}

function waitForNetworkIdle(tabId: number, timeout: number, idleMs: number): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const startedWithLastActivity = lastNetworkActivityAtByTabId.get(tabId);
    if (!startedWithLastActivity) lastNetworkActivityAtByTabId.set(tabId, startedAt);
    let pollTimer = 0;
    let timeoutTimer = 0;
    const cleanup = () => {
      clearInterval(pollTimer);
      clearTimeout(timeoutTimer);
    };
    const settle = (result: Record<string, unknown>) => {
      cleanup();
      resolve(result);
    };
    const activeRequestCount = () => networkRequestIdsByTabId.get(tabId)?.size ?? 0;
    const check = () => {
      const active = activeRequestCount();
      const lastActivityAt = lastNetworkActivityAtByTabId.get(tabId) ?? startedAt;
      const quietFor = Date.now() - lastActivityAt;
      if (active === 0 && quietFor >= idleMs) {
        settle({
          text: `Network idle for ${idleMs}ms`,
          networkIdle: {
            quietMs: idleMs,
            activeRequests: 0,
            waitedMs: Date.now() - startedAt,
          },
        });
      }
    };
    pollTimer = setInterval(check, NETWORK_IDLE_POLL_INTERVAL_MS);
    timeoutTimer = setTimeout(
      () =>
        settle({
          error: {
            code: "TimeoutError",
            message: `Timed out waiting for network idle after ${timeout}ms (${activeRequestCount()} request(s) still active)`,
          },
        }),
      timeout
    );
    check();
  });
}

async function waitForTabComplete(tabId: number, timeout: number) {
  await waitForTabState(tabId, timeout, (tab) => tab.status === "complete");
}

async function waitForTabReady(tabId: number, expectedUrl: string, previousUrl: string | undefined, timeout: number) {
  await waitForTabState(tabId, timeout, (tab) => {
    if (tab.status !== "complete" || !tab.url || tab.url === "about:blank" || tab.url === "about:newtab") return false;
    if (tab.url === expectedUrl || tab.url.startsWith(`${expectedUrl}#`)) return true;
    return previousUrl ? tab.url !== previousUrl : true;
  });
}

function isInspectableTab(tab: any) {
  return Boolean(typeof tab?.id === "number" && tab.url && tab.url !== "about:blank" && tab.url !== "about:newtab");
}

async function waitForTabState(tabId: number, timeout: number, isReady: (tab: any) => boolean) {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let timeoutTimer = 0;
    let pollTimer = 0;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      clearInterval(pollTimer);
      browser.tabs.onUpdated.removeListener(listener);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const checkCurrent = async () => {
      try {
        const tab = await browser.tabs.get(tabId);
        if (isReady(tab)) succeed();
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    };
    const listener = (updatedTabId: number, _changeInfo: any, updatedTab: any) => {
      if (updatedTabId === tabId && isReady(updatedTab)) succeed();
    };

    timeoutTimer = setTimeout(() => fail(new Error("timeout waiting for page load")), timeout);
    browser.tabs.onUpdated.addListener(listener);
    pollTimer = setInterval(() => void checkCurrent(), TAB_READY_POLL_INTERVAL_MS);
    void checkCurrent();
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

function summarizeElement(element: ElementSnapshot, options: Pick<SnapshotOptions, "urls"> = { urls: false }): string {
  const name = element.name || element.label || element.placeholder || element.text;
  const disabled = element.disabled ? " disabled" : "";
  const url = options.urls && element.href ? ` ${truncate(element.href, 120)}` : "";
  return `${element.role}${name ? ` "${truncate(name, 80)}"` : ""}${url}${disabled}`;
}

function withDialogs(result: Record<string, unknown>, frames: FrameSnapshot[]) {
  const dialogs = frames.flatMap((frame) => frame.dialogs ?? []);
  if (dialogs.length) {
    result.dialogs = dialogs;
    result.warnings = dialogs.map((dialog) =>
      structuredWarning("PAGE_DIALOG", "dialogs", `${dialog.type}: ${dialog.message}`, { dialogType: dialog.type })
    );
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
  const positional = firstPositionalArg(args, ["--selector", "--timeout", "--state"]);
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
  const doubleStar = "\u0000";
  const escaped = pattern
    .replace(/\*\*/g, doubleStar)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .split(doubleStar)
    .join(".*");
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
