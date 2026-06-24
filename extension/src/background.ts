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
  createdAt: string;
  updatedAt: string;
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

const HOST_NAME = "dev.pi.pire_browser";
const CHUNK_SIZE = 700_000;
const CLOSE_TEARDOWN_DELAY_MS = 0;
const TAB_READY_POLL_INTERVAL_MS = 100;
const NETWORK_IDLE_QUIET_MS = 500;
const NETWORK_IDLE_POLL_INTERVAL_MS = 50;
const MAX_NETWORK_RECORDS_PER_TAB = 300;
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
const networkRoutes = new Map<string, NetworkRouteRule>();
const networkRouteMatchesByRequestId = new Map<string, { routeId: string; action: "continue" | "abort" | "mock" }>();
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
  }
}

async function executeRequest(request: RpcRequest): Promise<RpcResponse> {
  try {
    if (request.method !== "command") {
      return errorResponse(request.id, "unsupported_method", `Unsupported method: ${request.method}`);
    }
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
    case "network":
      if (subcommand === "requests") return args.includes("--clear") ? "state" : "get";
      if (subcommand === "request") return "get";
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
    case "addinitscript":
    case "removeinitscript":
      return "eval";
    case "scroll":
    case "scrollintoview":
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
      if (subcommand === "login") return "fill";
      return null;
    case "state":
      if (subcommand === "save" || subcommand === "load") return "state";
      return null;
    case "set":
      if (subcommand === "headers" || subcommand === "offline" || subcommand === "credentials") return "network";
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
  if (action === "scroll" || action === "scrollintoview") return "scroll";
  if (["press", "key", "hover", "focus"].includes(action)) return "interact";
  if (action === "eval") return "eval";
  return "interact";
}

function notAvailableActionPolicyRoot(command: string) {
  return [
    "connect",
    "dashboard",
    "device",
    "install",
    "profiler",
    "profiles",
    "react",
    "record",
    "stream",
    "swipe",
    "tap",
    "trace",
    "upgrade",
  ].includes(command);
}

function domainPolicyDestinationUrl(args: string[]): string | undefined {
  const [command, subcommand, ...rest] = args;
  if (["open", "goto", "navigate"].includes(command ?? "")) {
    return firstPositionalArg(args.slice(1), ["--label", "--init-script", "--headers"]);
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
      "vitals",
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
    case "select":
      return targetActionCommand("select", rest);
    case "check":
    case "uncheck":
      return targetActionCommand(command, rest);
    case "scroll":
      return scrollCommand(rest);
    case "mouse":
      return mouseCommand(rest);
    case "drag":
      return dragCommand(rest);
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
      return batchCommand(rest, domainPolicy, actionPolicy, confirmationPolicy);
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
      return uploadCommand(rest, params.uploadFiles);
    case "auth":
      return authCommand(rest, domainPolicy);
    case "network":
      return networkCommand(rest);
    case "vitals":
      return vitalsCommand(rest, domainPolicy);
    case "addinitscript":
      return addInitScriptCommand(rest);
    case "removeinitscript":
      return removeInitScriptCommand(rest);
    case "set":
      return setCommand(rest);
    case "install":
    case "upgrade":
    case "stream":
    case "dashboard":
    case "trace":
    case "profiler":
    case "record":
    case "confirm":
    case "deny":
    case "session":
    case "profiles":
    case "react":
    case "pdf":
    case "connect":
    case "device":
    case "tap":
    case "swipe":
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
  const url = firstPositionalArg(args, ["--label", "--init-script", "--headers"]);
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
  const registered = await registerInitScripts(initScripts.scripts);
  if ("error" in registered) return registered;
  const headerScope = parsedHeaders.provided ? setHeadersForUrl(url, parsedHeaders.headers) : null;
  if (headerScope && "error" in headerScope) return headerScope;
  const active = await activeTab();
  const previousUrl = active?.url;
  let tab: any;
  const warnings: unknown[] = mergeWarnings(params.proxyWarnings, registered.warnings);
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
  const frames = await snapshotTab(tab.tabId, options.selector, options.depth, selectedFrameIdForTab(tab.tabId));
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
  const boolFlags = new Set(["-i", "--interactive", "-c", "--compact", "-u", "--urls", "--json"]);
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
  urls: boolean;
  selector?: string;
  depth?: number;
};

function parseSnapshotOptions(args: string[]): SnapshotOptions | { error: RpcResponse["error"] } {
  let selector: string | undefined;
  let depth: number | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "-s" || arg === "--scope") {
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
    if (["-i", "--interactive", "-c", "--compact", "-u", "--urls", "--json"].includes(arg)) continue;
    if (arg.startsWith("-")) {
      return { error: { code: "invalid_args", message: `Unsupported snapshot option: ${arg}` } };
    }
  }
  return {
    interactive: args.includes("-i") || args.includes("--interactive"),
    compact: args.includes("-c") || args.includes("--compact"),
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
  if (args.includes("--new-tab")) return clickNewTab(locator.locator, frameId);
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
  const tab = await targetTab();
  const frames = await findInTab(tab.tabId, locator, selectedFrameIdForTab(tab.tabId));
  const matches = frames.flatMap((frame) => frame.elements.map(() => frame.frameId));
  if (matches.length === 0) return { error: { code: "not_found", message: "No element matched locator" } };
  if (matches.length > 1) return { error: { code: "ambiguous_locator", message: `${matches.length} elements matched locator` } };
  if (action === "click") return clickLocator(locator, matches[0]);
  if (action === "fill") return fillLocator(locator, text, matches[0]);
  if (["text", "html", "value", "attr", "box", "styles"].includes(action)) {
    const response = await sendFrame(tab.tabId, matches[0], { type: "get", locator, property: action, attribute: text }, { staleOnFrameRoutingError: true });
    return normalizeContentResponse(response);
  }
  const response = await sendFrame(tab.tabId, matches[0], { type: action, locator, text, value: text, property: action }, { staleOnFrameRoutingError: true });
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

async function uploadCommand(args: string[], filesValue: unknown) {
  const target = args[0];
  if (!target) return { error: { code: "InvalidArgumentError", message: "upload requires <target> <files...>" } };
  const files = uploadFilesFromParams(filesValue);
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

function uploadFilesFromParams(value: unknown): { files: UploadFilePayload[] } | { error: Record<string, unknown> } {
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
  const script = args.join(" ");
  if (!script) return { error: { code: "InvalidArgumentError", message: "eval requires <js>" } };
  const tab = await targetTab();
  const response = await sendFrame(tab.tabId, undefined, { type: "eval", script });
  return normalizeContentResponse(response);
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

async function screenshotCommand(args: string[]) {
  const dir = valueAfter(args, "--screenshot-dir");
  const format = valueAfter(args, "--screenshot-format") === "jpeg" ? "jpeg" : "png";
  const quality = Number(valueAfter(args, "--screenshot-quality") ?? "92");
  const positional = firstPositionalArg(args, ["--screenshot-dir", "--screenshot-format", "--screenshot-quality"]);
  const generatedName = `pire-browser-screenshot-${Date.now()}.${format === "jpeg" ? "jpg" : "png"}`;
  const defaultScreenshotPath = !dir && !positional;
  const path = screenshotPathFor(dir, positional, generatedName);
  const annotate = args.includes("--annotate");
  const full = args.includes("--full");
  const tab = await targetTab();
  await activatePage(tab);
  let annotationResult: Record<string, any> | null = null;
  const annotationFrameId = selectedFrameIdForTab(tab.tabId);
  if (annotate) {
    const response = await sendFrame(tab.tabId, annotationFrameId, { type: "screenshot_annotate", fullPage: full });
    const result = normalizeContentResponse(response);
    if ("error" in result) return result;
    annotationResult = addScreenshotAnnotationRefs(result as Record<string, any>, tab.tabId, annotationFrameId ?? 0);
    await delay(50);
  }
  let meta: Record<string, unknown>;
  let fullPage: Record<string, unknown> | undefined;
  try {
    const capture = full
      ? await captureFullPageScreenshot(tab, format, quality)
      : { dataUrl: await browser.tabs.captureVisibleTab(tab.windowId, { format, quality }), fullPage: undefined };
    fullPage = capture.fullPage;
    const dataUrl = capture.dataUrl;
    meta = await sendScreenshotChunks(dataUrl);
  } finally {
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
    warnings: mergeWarnings(annotationResult?.warnings),
  };
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
  if (subcommand === "device") return setDeviceCommand(rest);
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

async function setDeviceCommand(args: string[]) {
  const parsed = parseDeviceArgs(args);
  if ("error" in parsed) return parsed;
  const resized = await resizeViewport(parsed.profile.width, parsed.profile.height, parsed.profile.scale, "set device");
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
        "set device",
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

function parseDeviceArgs(args: string[]): { profile: DeviceProfile } | { error: RpcResponse["error"] } {
  if (args.some((arg) => arg.startsWith("-") && arg !== "--json")) {
    return { error: { code: "InvalidArgumentError", message: "set device does not support options" } };
  }
  const name = args.filter((arg) => arg !== "--json").join(" ").trim();
  if (!name) {
    return {
      error: {
        code: "InvalidArgumentError",
        message: `set device requires <name>. Supported devices: ${supportedDeviceNames()}`,
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
  if (!target) return { error: { code: "invalid_args", message: "frame requires <ref|selector> or main" } };
  if (target === "main") {
    selectedFramesByTabId.delete(tab.tabId);
    return { text: "Frame targeting reset to main", frame: { frameId: 0, main: true } };
  }

  const locator = locatorFromTarget(target);
  if ("error" in locator) return locator;
  const parentFrameId = targetFrameIdForTab(tab.tabId, locator.frameId) ?? 0;
  const response = await sendFrame(
    tab.tabId,
    parentFrameId,
    { type: "frame_target", locator: locator.locator },
    { staleOnFrameRoutingError: true }
  );
  const targetResult = normalizeContentResponse(response);
  if ("error" in targetResult) return targetResult;

  const child = await childFrameForTarget(tab.tabId, parentFrameId, targetResult);
  if ("error" in child) return child;
  selectedFramesByTabId.set(tab.tabId, {
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

async function networkCommand(args: string[]) {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand.startsWith("--") || subcommand === "requests") {
    return networkRequestsCommand(subcommand?.startsWith("--") ? args : rest);
  }
  if (subcommand === "request") return networkRequestDetailCommand(rest);
  if (subcommand === "route") return networkRouteCommand(rest);
  if (subcommand === "unroute") return networkUnrouteCommand(rest);
  if (subcommand === "har" || subcommand === "export-har") return networkHarCommand(rest);
  return { error: { code: "invalid_args", message: "network requires requests|request|route|unroute|har|export-har" } };
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
    "HAR export is built from Firefox WebExtension request metadata. Request/response headers, cookies, and response bodies are not captured."
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
  ].filter(Boolean).join("\n");
}

function networkHarForRecords(records: ReturnType<typeof publicNetworkRecord>[], tab: TabRecord, options: { startedAt?: number } = {}) {
  const pageStartedAt = options.startedAt ?? Math.min(...records.map((record) => record.startedAt).filter(Number.isFinite), Date.now());
  return {
    log: {
      version: "1.2",
      creator: {
        name: "pire-browser",
        version: browser.runtime.getManifest().version,
        comment: "Firefox WebExtension metadata export; bodies and headers are not captured.",
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
      headers: [],
      queryString: harQueryString(record.url),
      headersSize: -1,
      bodySize: -1,
    },
    response: {
      status,
      statusText: harStatusText(record),
      httpVersion: "HTTP/1.1",
      cookies: [],
      headers: [],
      content: {
        size: -1,
        mimeType: "x-unknown",
      },
      redirectURL: "",
      headersSize: -1,
      bodySize: -1,
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
  confirmationPolicy: ConfirmationPolicyContext | null
) {
  const bailOnError = args.includes("--bail");
  const commands = args.filter((arg) => arg !== "--bail");
  const results: Record<string, unknown>[] = [];
  for (const commandText of commands) {
    const commandArgs = splitCommand(commandText);
    const result = await executeCommandWithPolicies(commandArgs, domainPolicy, actionPolicy, confirmationPolicy);
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

async function authCommand(args: string[], domainPolicy: DomainPolicyContext | null) {
  const [subcommand, name, ...rest] = args;
  if (subcommand === "save") return authSaveCommand(name, rest);
  if (subcommand === "login") return authLoginCommand(name, domainPolicy);
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
    text: `Logged in with auth profile ${name}`,
    profile: publicAuthProfile(profile),
    results: {
      open: resultSummary(opened),
      username: resultSummary(username),
      password: resultSummary(password),
      submit: resultSummary(submit),
    },
    warnings: mergeWarnings((opened as any).warnings, authStorageWarning()),
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
    "pire-browser auth profiles are stored in the managed Firefox profile extension storage, not a full encrypted auth vault."
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

async function snapshotTab(tabId: number, selector?: string, depth?: number, frameId?: number): Promise<FrameSnapshot[]> {
  const frames = await framesForScope(tabId, frameId);
  const out: FrameSnapshot[] = [];
  for (const frame of frames) {
    try {
      const snapshot = await sendFrame(tabId, frame.frameId, { type: "snapshot", selector, depth });
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
  browser.webRequest.onBeforeRequest.addListener(
    trackNetworkRequestStart,
    { urls: ["<all_urls>"] }
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
  };
  networkRequestsById.set(requestId, record);
  rememberNetworkRecord(tabId, requestId);
  const ids = networkRequestIdsByTabId.get(tabId) ?? new Set<string>();
  ids.add(requestId);
  networkRequestIdsByTabId.set(tabId, ids);
  lastNetworkActivityAtByTabId.set(tabId, now);
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
