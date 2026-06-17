import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";

type ClosePlanner = (
  liveTabs: { id?: number; windowId?: number }[],
  controlledTabIds: Set<number>,
  fallbackTabId?: number
) => { windowIds: number[]; tabIds: number[] };

type DomainPolicyErrorForUrl = (
  input: string,
  policy: { enabled: boolean; patterns: string[] }
) => { code: string; message: string } | null;

type ActionPolicyVerdictForCommand = (
  args: string[],
  policy: { enabled: boolean; default?: "allow" | "deny"; allow?: string[]; deny?: string[] }
) => { category: string | null; decision: string };

type ConfirmationPolicyErrorForCommand = (
  args: string[],
  actionPolicy: { enabled: boolean; default?: "allow" | "deny"; allow?: string[]; deny?: string[] } | null,
  policy: { enabled: boolean; categories: string[]; approvedConfirmationId?: string } | null
) => { code: string; data?: { phase?: string; category?: string }; message: string } | null;

function extensionFile(path: string) {
  return readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
}

function repoFile(path: string) {
  return readFileSync(resolve(import.meta.dirname, "..", "..", path), "utf8");
}

function backgroundSource() {
  return extensionFile("src/background.ts");
}

function loadClosePlanner(): ClosePlanner {
  const body = backgroundSource();
  const start = body.indexOf("function planControlledClose(");
  const end = body.indexOf("\nfunction tabsInWindows", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const source = body.slice(start, end);
  const js = transpileModule(`${source}\nthis.__planControlledClose = planControlledClose;`, {
    compilerOptions: { module: ModuleKind.ES2020, target: ScriptTarget.ES2020 },
  }).outputText;
  const sandbox: { __planControlledClose?: ClosePlanner } = {};
  runInNewContext(js, sandbox);
  if (!sandbox.__planControlledClose) throw new Error("planControlledClose did not load");
  return sandbox.__planControlledClose;
}

function loadDomainPolicyErrorForUrl(): DomainPolicyErrorForUrl {
  const body = backgroundSource();
  // Keep domainPolicyErrorForUrl and its helper functions contiguous in background.ts;
  // this extraction intentionally tests the same helper block the extension uses.
  const start = body.indexOf("function domainPolicyErrorForUrl(");
  const end = body.indexOf("\n// Maintainer note: update this list", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  const source = body.slice(start, end);
  const js = transpileModule(`${source}\nthis.__domainPolicyErrorForUrl = domainPolicyErrorForUrl;`, {
    compilerOptions: { module: ModuleKind.ES2020, target: ScriptTarget.ES2020 },
  }).outputText;
  const sandbox: { __domainPolicyErrorForUrl?: DomainPolicyErrorForUrl; URL: typeof URL } = { URL };
  runInNewContext(js, sandbox);
  if (!sandbox.__domainPolicyErrorForUrl) throw new Error("domainPolicyErrorForUrl did not load");
  return sandbox.__domainPolicyErrorForUrl;
}

function loadActionPolicyVerdictForCommand(): ActionPolicyVerdictForCommand {
  const body = backgroundSource();
  const actionStart = body.indexOf("function actionPolicyFromParams(");
  const actionEnd = body.indexOf("\nfunction domainPolicyDestinationUrl", actionStart);
  const parseStart = body.indexOf("function parseFind(");
  const parseEnd = body.indexOf("\nfunction normalizeContentResponse", parseStart);
  const helperStart = body.indexOf("function valueAfter(");
  const helperEnd = body.indexOf("\nfunction truncate", helperStart);
  expect(actionStart).toBeGreaterThanOrEqual(0);
  expect(actionEnd).toBeGreaterThan(actionStart);
  expect(parseStart).toBeGreaterThanOrEqual(0);
  expect(parseEnd).toBeGreaterThan(parseStart);
  expect(helperStart).toBeGreaterThanOrEqual(0);
  expect(helperEnd).toBeGreaterThan(helperStart);
  const source = [body.slice(actionStart, actionEnd), body.slice(parseStart, parseEnd), body.slice(helperStart, helperEnd)].join("\n");
  const js = transpileModule(`${source}\nthis.__actionPolicyVerdictForCommand = actionPolicyVerdictForCommand;`, {
    compilerOptions: { module: ModuleKind.ES2020, target: ScriptTarget.ES2020 },
  }).outputText;
  const sandbox: { __actionPolicyVerdictForCommand?: ActionPolicyVerdictForCommand } = {};
  runInNewContext(js, sandbox);
  if (!sandbox.__actionPolicyVerdictForCommand) throw new Error("actionPolicyVerdictForCommand did not load");
  return sandbox.__actionPolicyVerdictForCommand;
}

function loadConfirmationPolicyErrorForCommand(): ConfirmationPolicyErrorForCommand {
  const body = backgroundSource();
  const actionStart = body.indexOf("function actionPolicyFromParams(");
  const actionEnd = body.indexOf("\nfunction domainPolicyDestinationUrl", actionStart);
  const parseStart = body.indexOf("function parseFind(");
  const parseEnd = body.indexOf("\nfunction normalizeContentResponse", parseStart);
  const helperStart = body.indexOf("function valueAfter(");
  const helperEnd = body.indexOf("\nfunction truncate", helperStart);
  expect(actionStart).toBeGreaterThanOrEqual(0);
  expect(actionEnd).toBeGreaterThan(actionStart);
  expect(parseStart).toBeGreaterThanOrEqual(0);
  expect(parseEnd).toBeGreaterThan(parseStart);
  expect(helperStart).toBeGreaterThanOrEqual(0);
  expect(helperEnd).toBeGreaterThan(helperStart);
  const source = [body.slice(actionStart, actionEnd), body.slice(parseStart, parseEnd), body.slice(helperStart, helperEnd)].join("\n");
  const js = transpileModule(`${source}\nthis.__confirmationPolicyErrorForCommand = confirmationPolicyErrorForCommand;`, {
    compilerOptions: { module: ModuleKind.ES2020, target: ScriptTarget.ES2020 },
  }).outputText;
  const sandbox: { __confirmationPolicyErrorForCommand?: ConfirmationPolicyErrorForCommand } = {};
  runInNewContext(js, sandbox);
  if (!sandbox.__confirmationPolicyErrorForCommand) throw new Error("confirmationPolicyErrorForCommand did not load");
  return sandbox.__confirmationPolicyErrorForCommand;
}

describe("compiled MV2 scripts", () => {
  it("declares text clipboard permissions", () => {
    const manifest = JSON.parse(extensionFile("manifest.json"));
    expect(manifest.permissions).toContain("clipboardRead");
    expect(manifest.permissions).toContain("clipboardWrite");
  });

  it("do not emit module export syntax", () => {
    for (const file of ["background.js", "content.js"]) {
      const body = extensionFile(`dist/${file}`);
      expect(body).not.toMatch(/\bexport\s*\{/);
      expect(body).not.toMatch(/\bimport\s+/);
    }
  });

  it("does not use window.close for browser teardown", () => {
    for (const file of ["src/background.ts", "dist/background.js"]) {
      const body = extensionFile(file);
      expect(body).not.toContain("window.close()");
    }
  });
});

describe("label locator regression", () => {
  it("keeps label text as metadata without making labels actionable candidates", () => {
    const body = extensionFile("src/content.ts");
    expect(body).toContain("labelText(element)");
    const selectorBlock = body.match(/const selector = \[([\s\S]*?)\]\.join/);
    expect(selectorBlock?.[1]).toBeTruthy();
    expect(selectorBlock?.[1]).not.toContain('"label"');
  });
});

describe("pire-browser command foundations", () => {
  const content = () => extensionFile("src/content.ts");
  const background = backgroundSource;

  it("uses frame-local handles so unnamed textbox refs are immediately actionable", () => {
    const body = content();
    expect(body).toContain('type Locator = NonHandleLocator | { kind: "handle"');
    expect(body).toContain("const handlesByElement = new WeakMap<Element, string>();");
    expect(body).toContain("const elementsByHandle = new Map<string, Element>();");
    expect(body).toContain("return { kind: \"handle\", handle, fallback };");
    expect(body).toContain("elementsByHandle.set(handle, element);");
    expect(body).toContain('if (role) return { kind: "role", role, index: indexFor({ kind: "role", role, index: 0 }, element) };');
    const backgroundBody = background();
    expect(backgroundBody).toContain("refs.set(ref");
    expect(backgroundBody).toContain("locator: element.locator");
    expect(backgroundBody).toContain("if (target.startsWith(\"@\"))");
    expect(backgroundBody).toContain("return { locator: ref.locator, frameId: ref.frameId };");
  });

  it("supports persistent iframe context through frame refs", () => {
    const body = background();
    const contentBody = content();
    expect(body).toContain("const selectedFramesByTabId = new Map");
    expect(body).toContain('if (target === "main")');
    expect(body).toContain('type: "frame_target"');
    expect(body).toContain("selectedFramesByTabId.set(tab.tabId");
    expect(body).toContain("selectedFrameIdForTab(tab.tabId)");
    expect(body).toContain("childFrameForTarget");
    expect(body).not.toContain("Frame command accepted");
    expect(contentBody).toContain('if (message.type === "frame_target")');
    expect(contentBody).toContain("function frameTargetLocator(locator: Locator)");
    expect(contentBody).toContain("function isFrameElement(element: Element)");
    expect(contentBody).toContain('tag === "iframe" || tag === "frame"');
    expect(contentBody).toContain("frameUrl: isFrameElement(element)");
  });

  it("accepts selector families", () => {
    const body = background();
    expect(body).toContain('if (target.startsWith("text="))');
    expect(body).toContain('if (target.startsWith("xpath="))');
    expect(body).toContain('return { kind: "css", selector: target, index: -1 };');
    expect(body).toContain('kind === "label" || kind === "text" || kind === "placeholder" || kind === "alt" || kind === "title"');
    expect(body).toContain('kind === "first" || kind === "last" || kind === "nth"');
  });

  it("preserves --exact for whole text and name matching", () => {
    const body = background();
    expect(body).toContain('const exact = rest.includes("--exact");');
    expect(body).toContain('locator = { kind: "role", role, name: valueAfter(rest, "--name"), index, exact };');
    expect(body).toContain("locator = { kind, text, index, exact } as Locator;");

    const contentBody = content();
    expect(contentBody).toContain("exact?: boolean");
    expect(contentBody).toContain("const textMatches = (haystack: string, needle: string, exact?: boolean)");
    expect(contentBody).toContain("return exact ? normalizedHaystack === normalizedNeedle : normalizedHaystack.includes(normalizedNeedle);");
    expect(contentBody).toContain("textMatches(text || name, locator.text, locator.exact)");
  });

  it("routes common legacy aliases and core actions", () => {
    const body = background();
    for (const command of [
      "dblclick",
      "type",
      "key",
      "keyboard",
      "hover",
      "focus",
      "select",
      "check",
      "uncheck",
      "scrollintoview",
      "get",
      "is",
      "tab",
      "back",
      "forward",
      "reload",
      "batch",
    ]) {
      expect(body).toContain(`case "${command}":`);
    }
  });

  it("routes keydown and keyup as focused edge events instead of press-compatible warnings", () => {
    const body = background();
    const contentBody = content();
    expect(body).toContain('case "keydown":');
    expect(body).toContain('case "keyup":');
    expect(body).toContain("return keyEdgeCommand(command, rest);");
    expect(body).toContain('{ type: "key_edge", action: command, key }');
    expect(body).not.toContain('bestEffortWarning("keydown"');
    expect(body).not.toContain('bestEffortWarning("keyup"');
    expect(contentBody).toContain('if (message.type === "key_edge")');
    expect(contentBody).toContain("function keyEdge(action: string, key: string)");
    expect(contentBody).toContain("dispatchKey(target, normalized, action, parsed);");
  });

  it("dispatches dblclick as a browser-like page mouse sequence", () => {
    const body = content();
    expect(body).toContain("function doubleClickLocator(locator: Locator)");
    expect(body).toContain("isDisabled(element)");
    expect(body).toContain('"not_enabled"');
    expect(body).toContain('new MouseEvent("mousedown"');
    expect(body).toContain('new MouseEvent("mouseup"');
    expect(body).toContain('new MouseEvent("click"');
    expect(body).toContain('new MouseEvent("dblclick"');
  });

  it("chunks large non-screenshot results through native messaging", () => {
    const body = background();
    expect(body).toContain("async function prepareLargeResult");
    expect(body).toContain('type: "result_chunk"');
    expect(body).toContain("largeResult");
  });

  it("keeps page targets tied to both Firefox tab and window ids", () => {
    const body = background();
    expect(body).toContain("type PageRecord = {");
    expect(body).toContain("tabId: number;");
    expect(body).toContain("windowId: number;");
    expect(body).toContain("controlled?: boolean;");
    expect(body).toContain("async function activatePage(page: PageRecord)");
    expect(body).toContain("markControlledPage(page)");
    expect(body).toContain("browser.windows.update(page.windowId, { focused: true })");
    expect(body).toContain("browser.tabs.update(page.tabId, { active: true })");
  });

  it("schedules close teardown after returning the success response", () => {
    const body = background();
    const closeHandler = body.match(/case "close":[\s\S]*?default:/)?.[0] ?? "";
    expect(closeHandler).toContain("scheduleControlledClose();");
    expect(closeHandler).toContain('return { text: "pire-browser extension close requested" };');
    expect(closeHandler.indexOf("scheduleControlledClose();")).toBeLessThan(
      closeHandler.indexOf('return { text: "pire-browser extension close requested" };')
    );
    expect(body).toContain("setTimeout(() => {");
    expect(body).toContain("void closeControlledSurfaces().catch");
    expect(body).toContain("if (!nativeReconnectEnabled) return;");
  });

  it("plans close by controlled ownership without sweeping unrelated windows", () => {
    const body = background();
    expect(body).toContain("function planControlledClose(");
    expect(body).toContain("if (windowTabs.every((tab) => controlledTabIds.has(tab.id)))");
    expect(body).toContain("windowIds.push(windowId)");
    expect(body).toContain("tabIds.push(...controlledTabs.map((tab) => tab.id))");
    expect(body).toContain('if (windowIds.length === 0 && tabIds.length === 0 && typeof fallbackTabId === "number")');
    expect(body).toContain("if (plan.windowIds.length > 0)");
    expect(body).toContain("disconnectNativeForControlledClose();");
    expect(body).toContain("browser.windows.remove(windowId)");
    expect(body).toContain("browser.tabs.remove(plan.tabIds)");
  });

  it("suppresses native reconnect before whole-window teardown", () => {
    const body = background();
    expect(body).toContain("function disconnectNativeForControlledClose()");
    expect(body).toContain("nativeReconnectEnabled = false;");
    expect(body).toContain("port?.disconnect?.();");
    expect(body.indexOf("disconnectNativeForControlledClose();")).toBeLessThan(
      body.indexOf("await browser.windows.remove(windowId);")
    );
  });

  it("closes a fully controlled window by window id", () => {
    const plan = loadClosePlanner()(
      [
        { id: 1, windowId: 10 },
        { id: 2, windowId: 10 },
      ],
      new Set([1, 2])
    );
    expect(plan).toEqual({ windowIds: [10], tabIds: [] });
  });

  it("closes only controlled tabs in a mixed window", () => {
    const plan = loadClosePlanner()(
      [
        { id: 1, windowId: 10 },
        { id: 2, windowId: 10 },
      ],
      new Set([1])
    );
    expect(plan).toEqual({ windowIds: [], tabIds: [1] });
  });

  it("falls back to the active tab when no controlled tab exists", () => {
    const plan = loadClosePlanner()([{ id: 1, windowId: 10 }], new Set(), 1);
    expect(plan).toEqual({ windowIds: [], tabIds: [1] });
  });

  it("settles wait observers and timers through a single cleanup path", () => {
    const body = content();
    expect(body).toContain("let settled = false;");
    expect(body).toContain("const settle = (result: Record<string, unknown>)");
    expect(body).toContain("window.clearTimeout(timer)");
    expect(body).toContain("window.clearInterval(timer)");
    expect(body).toContain("observer?.disconnect();");
    expect(body).toContain("Timed out waiting for selector");
    expect(body).toContain("Timed out waiting for text");
  });

  it("evaluates wait fn and eval in the page world", () => {
    const body = content();
    expect(body).toContain("function evaluatePageExpression");
    expect(body).toContain("wrappedJSObject");
    expect(body).toContain("serializePageValue");
    expect(body).toContain("const pageEval = typeof pageWindow.eval");
    expect(body).toContain("if (!isSyntaxError(error)) return failedPageEvaluation(error)");
    expect(body).toContain("truthy: Boolean(value)");
    expect(body).toContain("Function condition satisfied");
    expect(body).not.toContain('bestEffortWarning("wait --fn"');
    expect(body).not.toContain('bestEffortWarning("eval"');
  });

  it("maps dead frame routing errors to stale refs for frame-scoped actions", () => {
    const body = background();
    expect(body).toContain("staleOnFrameRoutingError");
    expect(body).toContain("function isFrameRoutingError");
    expect(body).toContain('code: "ref_stale"');
    expect(body).toContain("Frame ${frameId} is not available; run snapshot or find again");
  });

  it("records shimmed dialogs for dialog status", () => {
    const body = background();
    const contentBody = content();
    expect(body).toContain("const recentDialogsByTabId = new Map");
    expect(contentBody).toContain('message.type === "dialog_status"');
    expect(contentBody).toContain('message.type === "dialog_control"');
    expect(contentBody).toContain("function dialogStatus()");
    expect(contentBody).toContain("function configureNextDialog");
    expect(contentBody).toContain("__pireBrowserDialogShimInstalled");
    expect(contentBody).toContain("let nextDialogResponse = null");
    expect(contentBody).toContain('data.kind !== "dialog_control"');
    expect(body).toContain("rememberDialogs(tabId, response?.dialogs)");
    expect(body).toContain("await collectDialogsForStatus(tabId)");
    expect(body).toContain('if (subcommand === "status")');
    expect(body).toContain('if (subcommand === "accept" || subcommand === "dismiss")');
    expect(body).toContain('type: "dialog_control"');
    expect(body).toContain("selectedFrameIdForTab(tab.tabId)");
    expect(body).toContain("active: Boolean(dialog)");
    expect(body).toContain("dialog,");
    expect(body).toContain("async function collectDialogsForStatus(tabId: number)");
    expect(body).toContain("function rememberDialogs(tabId: number, dialogs: unknown)");
    expect(body).toContain("function isDialogRecord(value: unknown)");
  });

  it("publishes active page summaries with session events", () => {
    const body = background();
    expect(body).toContain("type ActivePageSummary = {");
    expect(body).toContain("async function postSessionEvent");
    expect(body).toContain("activePage: await activePageSummary()");
    expect(body).toContain("async function activePageSummary()");
    expect(body).toContain("agentId: record.agentId");
    expect(body).toContain("updatedAt: Date.now()");
    expect(body).toContain('void postSessionEvent("heartbeat", {})');
    expect(body).toContain('void postSessionEvent("focused", {})');
    expect(body).toContain('void postSessionEvent("tabs_changed", {})');
  });

  it("routes strict clipboard commands through the extension clipboard API", () => {
    const body = background();
    expect(body).toContain('case "clipboard":');
    expect(body).toContain("return clipboardCommand(rest);");
    expect(body).toContain("async function clipboardCommand");
    expect(body).toContain("navigator.clipboard.readText()");
    expect(body).toContain("navigator.clipboard.writeText(text)");
    expect(body).toContain("clipboard_selection");
    expect(body).toContain("clipboard_paste");
    expect(body).toContain('"clipboard copy"');
    expect(body).toContain('"clipboard paste"');
  });

  it("routes downloads through the Firefox downloads API", () => {
    const body = background();
    expect(body).toContain('case "download":');
    expect(body).toContain("return downloadCommand(rest);");
    expect(body).toContain("async function downloadCommand");
    expect(body).toContain("async function waitDownloadCommand");
    expect(body).toContain("browser.downloads.search");
    expect(body).toContain("browser.downloads.onChanged");
    expect(body).toContain('"--download"');
  });

  it("implements set viewport as a Firefox best-effort command", () => {
    const body = background();
    expect(body).toContain('case "set":');
    expect(body).toContain("return setCommand(rest);");
    expect(body).toContain("async function setCommand");
    expect(body).toContain("function parseViewportArgs");
    expect(body).toContain('type: "viewport_metrics"');
    expect(body).toContain("Firefox WebExtensions resize the browser window to approximate the requested content viewport");
  });

  it("implements color scheme media emulation through Firefox browser settings", () => {
    const body = background();
    const manifest = readFileSync(resolve(__dirname, "../manifest.json"), "utf8");
    expect(manifest).toContain('"browserSettings"');
    expect(body).toContain("params.colorScheme");
    expect(body).toContain("params.appliedColorScheme");
    expect(body).toContain('if (subcommand === "media") return setMediaCommand(rest);');
    expect(body).toContain("async function setMediaCommand");
    expect(body).toContain("function normalizeContentColorScheme");
    expect(body).toContain("browser.browserSettings?.overrideContentColorScheme");
    expect(body).toContain("set({ value: scheme })");
  });

  it("implements origin-scoped request headers without echoing values", () => {
    const body = background();
    expect(body).toContain("const headersByOrigin = new Map");
    expect(body).toContain("registerHeaderListener();");
    expect(body).toContain("browser.webRequest.onBeforeSendHeaders.addListener");
    expect(body).toContain("applyScopedRequestHeaders");
    expect(body).toContain('valueAfter(args, "--headers")');
    expect(body).toContain("function parseHeadersOption");
    expect(body).toContain("function setHeadersForUrl");
    expect(body).toContain("function applyHeadersForOrigin");
    expect(body).toContain("names: headers.map((header) => header.name)");
    expect(body).not.toContain("values: headers.map");
  });

  it("counts matching elements through findInTab for get count", () => {
    const body = background();
    expect(body).toContain('if (property === "count")');
    expect(body).toContain("const frames = await findInTab(tab.tabId, locator.locator, targetFrameIdForTab(tab.tabId, locator.frameId));");
    expect(body).toContain("frames.reduce((sum, frame) => sum + frame.elements.length, 0)");
    expect(body).toContain("return { text: String(count), value: count };");
  });

  it("tracks WebRequest activity for wait --load networkidle", () => {
    const body = background();
    expect(body).toContain("const networkRequestsById = new Map");
    expect(body).toContain("const networkRequestIdsByTabId = new Map");
    expect(body).toContain("registerNetworkActivityListeners();");
    expect(body).toContain("browser.webRequest.onBeforeRequest.addListener");
    expect(body).toContain("browser.webRequest.onCompleted");
    expect(body).toContain("browser.webRequest.onErrorOccurred");
    expect(body).toContain("function waitForNetworkIdle");
    expect(body).toContain('loadState === "networkidle"');
    expect(body).toContain("NETWORK_IDLE_QUIET_MS");
  });

  it("collects viewport metrics from the content script for set viewport verification", () => {
    const body = content();
    expect(body).toContain('if (message.type === "viewport_metrics") return Promise.resolve(viewportMetrics());');
    expect(body).toContain("function viewportMetrics");
    expect(body).toContain("innerWidth: window.innerWidth");
    expect(body).toContain("innerHeight: window.innerHeight");
    expect(body).toContain("devicePixelRatio: window.devicePixelRatio");
  });

  it("annotates screenshots with temporary visible overlays before capture", () => {
    const backgroundBody = background();
    const contentBody = content();
    expect(backgroundBody).toContain('args.includes("--annotate")');
    expect(backgroundBody).toContain('type: "screenshot_annotate"');
    expect(backgroundBody).toContain("addScreenshotAnnotationRefs");
    expect(backgroundBody).toContain("Annotation refs:");
    expect(backgroundBody).toContain("Use these @e refs for follow-up click/fill/get commands.");
    expect(backgroundBody).toContain("await delay(50)");
    expect(backgroundBody).toContain("captureVisibleTab");
    expect(backgroundBody).toContain('type: "screenshot_clear_annotations"');
    expect(backgroundBody).toContain("function screenshotPathFor");
    expect(backgroundBody).toContain("const defaultScreenshotPath = !dir && !positional");
    expect(backgroundBody).toContain("screenshotDefaultPath: defaultScreenshotPath || undefined");
    expect(backgroundBody).toContain("const name = positional && !/[\\\\/]/.test(positional) ? positional : positional ? undefined : generatedName");
    expect(contentBody).toContain('if (message.type === "screenshot_annotate") return Promise.resolve(annotateScreenshot(Boolean(message.fullPage)));');
    expect(contentBody).toContain('data-pire-browser-screenshot-annotation');
    expect(contentBody).toContain('Annotated ${annotations.length} ${fullPage ? "document" : "visible"} element(s)');
    expect(contentBody).toContain("function clearScreenshotAnnotationsResult");
  });

  it("stitches full-page screenshots from viewport tiles and restores scroll", () => {
    const backgroundBody = background();
    const contentBody = content();
    expect(backgroundBody).toContain('const full = args.includes("--full")');
    expect(backgroundBody).toContain("await captureFullPageScreenshot(tab, format, quality)");
    expect(backgroundBody).toContain("function tilePositions");
    expect(backgroundBody).toContain('type: "screenshot_full_metrics"');
    expect(backgroundBody).toContain('type: "screenshot_scroll", x, y');
    expect(backgroundBody).toContain("context.drawImage(");
    expect(backgroundBody).toContain("canvas.toDataURL(mimeType");
    expect(backgroundBody).toContain("fullPage: {");
    expect(contentBody).toContain('if (message.type === "screenshot_full_metrics") return Promise.resolve(screenshotFullMetrics());');
    expect(contentBody).toContain('if (message.type === "screenshot_scroll") return screenshotScroll');
    expect(contentBody).toContain("function screenshotFullMetrics");
    expect(contentBody).toContain("function screenshotScroll");
  });

  it("routes uploads through file-input assignment without echoing payload bytes", () => {
    const backgroundBody = background();
    const contentBody = content();
    expect(backgroundBody).toContain('case "upload":');
    expect(backgroundBody).toContain("return uploadCommand(rest, params.uploadFiles);");
    expect(backgroundBody).toContain("function uploadFilesFromParams");
    expect(backgroundBody).toContain('return "upload";');
    expect(contentBody).toContain('message.type === "upload_files"');
    expect(contentBody).toContain("function uploadFilesLocator");
    expect(contentBody).toContain("new DataTransfer()");
    expect(contentBody).toContain("input.element.files = transfer.files");
    expect(contentBody).toContain("element instanceof HTMLLabelElement");
    expect(contentBody).not.toContain("bytesBase64, dialogs");
  });

  it("routes active-origin state export and import through focused helpers", () => {
    const body = background();
    expect(body).toContain('case "state":');
    expect(body).toContain("return stateCommand(rest);");
    expect(body).toContain("async function stateExportCommand");
    expect(body).toContain("async function stateImportCommand");
    expect(body).toContain('type: "state_export_storage"');
    expect(body).toContain('type: "state_import_storage"');
    expect(body).toContain("state load origin mismatch");
    expect(body).toContain("displayUrlWithoutQueryOrFragment(state.source.url)");
    expect(body).toContain("restoreCookie");
    expect(body).toContain("browser.tabs.reload(tab.tabId)");
  });

  it("checks active-page domain policy before content actions", () => {
    const body = background();
    expect(body).toContain("type DomainPolicyContext = {");
    expect(body).toContain("executeCommandWithPolicies(args, domainPolicy, actionPolicy, confirmationPolicy, request.params ?? {})");
    expect(body).toContain("domainPolicyErrorForCommand(args, domainPolicy)");
    expect(body).toContain("domainPolicyDestinationUrl(args)");
    expect(body).toContain("function commandNeedsActivePageDomainCheck");
    expect(body).toContain("await targetTab().catch(() => undefined)");
    expect(body).toContain('"DomainPolicyError"');
    expect(body).toContain('"snapshot"');
    expect(body).toContain('command === "clipboard"');
    expect(body).toContain('command === "state"');
    expect(body).toContain('command === "tab" || command === "tabs"');
    expect(body).toContain('subcommand === "new"');
    expect(body).toContain('"--load"');
    expect(body).toContain('"upload"');
    expect(body).toContain("function explicitNonHttpScheme");
    expect(body).toContain("function normalizePolicyHost");
    expect(body).toContain("batchCommand(rest, domainPolicy, actionPolicy, confirmationPolicy)");
    expect(body).toContain("const commandArgs = splitCommand(commandText)");
    expect(body).toContain("executeCommandWithPolicies(commandArgs, domainPolicy, actionPolicy, confirmationPolicy)");
    expect(body).toContain("Maintainer note: update this list whenever a command reads");
  });

  it("routes action policy through shared request and batch gates", () => {
    const body = background();
    expect(body).toContain("type ActionPolicyContext = {");
    expect(body).toContain("actionPolicyFromParams(request.params?.actionPolicy)");
    expect(body).toContain("actionPolicyErrorForCommand(args, actionPolicy)");
    expect(body).toContain("function actionPolicyVerdictForCommand");
    expect(body).toContain("function actionPolicyCategoryForCommand");
    expect(body).toContain('"ActionPolicyError"');
    expect(body).toContain('data: { phase: "policy" }');
    expect(body).toContain('errorCode === "DomainPolicyError" || errorCode === "ActionPolicyError" || errorCode === "ConfirmationRequired"');
    expect(body).toContain("findActionPolicyCategory(args)");
  });

  it("propagates batch --bail command errors instead of reporting success", () => {
    const body = background();
    expect(body).toContain('if (bailOnError && "error" in result) {');
    expect(body).toContain("function batchStepResult(command: string[], result: Record<string, unknown>)");
    expect(body).toContain("results.push(batchStepResult(commandArgs, result))");
    expect(body).toContain("command,");
    expect(body).toContain("success: false");
    expect(body).toContain("batchErrorResult(result.error as RpcResponse[\"error\"]");
    expect(body).toContain("batch: { text, results }");
  });

  it("routes confirmation policy through request and batch gates", () => {
    const body = background();
    expect(body).toContain("type ConfirmationPolicyContext = {");
    expect(body).toContain("confirmationPolicyFromParams(request.params?.confirmationPolicy)");
    expect(body).toContain("confirmationPolicyErrorForCommand(args, actionPolicy, confirmationPolicy)");
    expect(body).toContain('"ConfirmationRequired"');
    expect(body).toContain("approvedConfirmationId");
  });

  it("honors approved confirmation ids including interactive approval", () => {
    const errorForCommand = loadConfirmationPolicyErrorForCommand();
    const actionPolicy = { enabled: false };
    const pending = errorForCommand(["eval", "document.title"], actionPolicy, {
      enabled: true,
      categories: ["eval"],
    });
    expect(pending?.code).toBe("ConfirmationRequired");
    expect(pending?.data?.category).toBe("eval");

    expect(
      errorForCommand(["eval", "document.title"], actionPolicy, {
        enabled: true,
        categories: ["eval"],
        approvedConfirmationId: "interactive",
      })
    ).toBeNull();
    expect(
      errorForCommand(["eval", "document.title"], actionPolicy, {
        enabled: true,
        categories: ["eval"],
        approvedConfirmationId: "c_1234abcd",
      })
    ).toBeNull();
  });

  it("matches shared action policy command verdict fixtures", () => {
    const verdict = loadActionPolicyVerdictForCommand();
    const fixture = JSON.parse(repoFile("tests/fixtures/action-policy-command-verdicts.json")) as {
      cases: {
        name: string;
        args: string[];
        policy: { default?: "allow" | "deny"; allow?: string[]; deny?: string[] };
        expectedCategory: string | null;
        expectedDecision: string;
      }[];
    };
    for (const testCase of fixture.cases) {
      const actual = verdict(testCase.args, { enabled: true, ...testCase.policy });
      expect(actual.category, testCase.name).toBe(testCase.expectedCategory);
      expect(actual.decision, testCase.name).toBe(testCase.expectedDecision);
    }
  });

  it("classifies every executable extension command root for action policy", () => {
    const verdict = loadActionPolicyVerdictForCommand();
    for (const args of [
      ["status"],
      ["open", "https://example.com"],
      ["open", "https://example.com", "--headers", "{\"Authorization\":\"Bearer token\"}"],
      ["goto", "https://example.com"],
      ["navigate", "https://example.com"],
      ["snapshot"],
      ["find", "label", "Email"],
      ["click", "@e1"],
      ["dblclick", "@e1"],
      ["fill", "@e1", "x"],
      ["type", "@e1", "x"],
      ["press", "Enter"],
      ["key", "Enter"],
      ["keyboard", "type", "x"],
      ["keydown", "Enter"],
      ["keyup", "Enter"],
      ["hover", "@e1"],
      ["focus", "@e1"],
      ["select", "@e1", "x"],
      ["check", "@e1"],
      ["uncheck", "@e1"],
      ["scroll"],
      ["scrollintoview", "@e1"],
      ["set", "viewport", "1280", "720"],
      ["set", "headers", "{\"X-Custom-Header\":\"value\"}"],
      ["wait"],
      ["wait", "--download", "file.txt"],
      ["screenshot"],
      ["get", "title"],
      ["is", "visible", "@e1"],
      ["eval", "document.title"],
      ["addinitscript", "window.__flag=true"],
      ["removeinitscript", "init1"],
      ["tab"],
      ["tabs"],
      ["back"],
      ["forward"],
      ["reload"],
      ["window", "new"],
      ["frame"],
      ["dialog"],
      ["batch", "get url"],
      ["cookies"],
      ["storage", "local"],
      ["clipboard", "read"],
      ["download", "@e1", "file.txt"],
      ["upload", "#file", "fixture.txt"],
      ["confirm", "c_1234abcd"],
      ["deny", "c_1234abcd"],
      ["close"],
      ["quit"],
      ["exit"],
    ]) {
      expect(verdict(args, { enabled: true, default: "allow" }).decision, args.join(" ")).not.toBe("unsupported");
    }
  });

  it("matches shared domain policy URL verdict fixtures", () => {
    const check = loadDomainPolicyErrorForUrl();
    const fixture = JSON.parse(repoFile("tests/fixtures/domain-policy-url-verdicts.json")) as {
      cases: { name: string; patterns: string[]; input: string; verdict: string }[];
    };
    for (const testCase of fixture.cases) {
      const error = check(testCase.input, { enabled: true, patterns: testCase.patterns });
      const actual = !error
        ? "allowed"
        : error.message.includes("URLs are not allowed")
          ? "non_http"
          : error.message.includes("invalid URL") || error.message.includes("empty URL")
            ? "invalid"
            : "denied";
      expect(actual, testCase.name).toBe(testCase.verdict);
    }
  });

  it("extracts selections and pastes only into focused editable text targets", () => {
    const body = content();
    expect(body).toContain("function clipboardSelection()");
    expect(body).toContain("function clipboardPaste(text: string)");
    expect(body).toContain("function selectedTextFromEditable");
    expect(body).toContain("function selectedTextFromDocument");
    expect(body).toContain("function isEditableTextTarget");
    expect(body).toContain("insertText(target, text)");
    expect(body).toContain("No focused editable element");
  });

  it("exports and imports active-origin web storage in the content script", () => {
    const body = content();
    expect(body).toContain('message.type === "state_export_storage"');
    expect(body).toContain('message.type === "state_import_storage"');
    expect(body).toContain("function stateExportStorage()");
    expect(body).toContain("function stateImportStorage");
    expect(body).toContain("localStorage.clear()");
    expect(body).toContain("sessionStorage.clear()");
    expect(body).toContain("function storageSnapshot");
  });

  it("prints tree-shaped default snapshots while keeping interactive snapshots flat", () => {
    const body = background();
    const snapshotBlock = body.match(/async function snapshotCommand[\s\S]*?async function findCommand/)?.[0] ?? "";
    expect(snapshotBlock).toContain("refs.set(ref");
    expect(snapshotBlock).toContain("const treeOutput = !options.interactive;");
    expect(snapshotBlock).toContain("snapshotFrameHeader(frame)");
    expect(snapshotBlock).toContain("snapshotTreeLine(element, ref, options, baseDepth)");
    expect(snapshotBlock).toContain("`  ${ref} ${summarizeElement(element, options)}`");
    expect(snapshotBlock).toContain("parseSnapshotOptions(args)");
    expect(snapshotBlock).toContain("const interactiveFrames = options.interactive ? interactiveSnapshotFrames(frames) : frames;");
    expect(snapshotBlock).toContain("compactSnapshotFrames(interactiveFrames)");
    expect(body).toContain("function summarizeTreeElement");
    expect(body).toContain("`ref=${ref}`");
  });
});

describe("command shape parity", () => {
  const content = () => extensionFile("src/content.ts");
  const background = backgroundSource;

  it("routes goto and navigate through the open command", () => {
    const body = background();
    expect(body).toContain('case "goto":');
    expect(body).toContain('case "navigate":');
    expect(body).toContain('return openCommand(rest, command || "open", params);');
  });

  it("supports click --new-tab for link targets", () => {
    const body = background();
    const contentBody = content();
    expect(body).toContain("const frameId = targetFrameIdForTab(tab.tabId, locator.frameId);");
    expect(body).toContain('if (args.includes("--new-tab")) return clickNewTab(locator.locator, frameId);');
    expect(body).toContain('type: "click_new_tab"');
    expect(body).toContain("browser.tabs.create({ url: url.href, active: true })");
    expect(body).toContain("markControlledPage(rememberTab(loadedTab))");
    expect(contentBody).toContain('if (message.type === "click_new_tab")');
    expect(contentBody).toContain("function clickNewTabLocator(locator: Locator)");
    expect(contentBody).toContain("function linkHrefFor");
    expect(contentBody).toContain("ctrlKey: true");
  });

  it("allows bare open while keeping bare goto and navigate invalid", () => {
    const body = background();
    expect(body).toContain('if (command !== "open")');
    expect(body).toContain("`${command} requires <url>`");
    expect(body).toContain("Browser open in ${tab.agentId}");
    expect(body).toContain('args.includes("--new-tab")');
    expect(body).toContain("isInspectableTab(current)");
    expect(body).toContain("Page readiness timed out");
    expect(body).toContain('structuredWarning(');
    expect(body).toContain('"NAVIGATION_RECOVERED"');
    expect(body).toContain('normalizeResultWarnings(result)');
  });

  it("reuses already-loaded file URL tabs for allow-file-access launches", () => {
    const body = background();
    expect(body).toContain("async function existingTabForUrl");
    expect(body).toContain("function isFileUrl");
    expect(body).toContain("function sameNavigationUrl");
    expect(body).toContain("Firefox blocked extension navigation to a file URL");
    expect(body).toContain("isFileUrl(url) ? await existingTabForUrl(url, active) : null");
  });

  it("supports best-effort open init scripts before navigation", () => {
    const body = background();
    expect(body).toContain('firstPositionalArg(args, ["--label", "--init-script", "--headers"])');
    expect(body).toContain("parseInitScripts(params.initScripts)");
    expect(body).toContain("async function registerInitScripts");
    expect(body).toContain("browser.contentScripts.register");
    expect(body).toContain('runAt: "document_start"');
    expect(body).toContain("allFrames: true");
    expect(body).toContain("matchAboutBlank: true");
    expect(body).toContain("function initScriptContentScript");
    expect(body).toContain("target.appendChild(script)");
    expect(body).toContain("await unregisterInitScripts(registered.registrations)");
    expect(body).toContain("bestEffortWarning(");
    expect(body).toContain('"open --init-script"');
    expect(body).toContain("Firefox WebExtension init scripts are best effort");
    expect(body).toContain('firstPositionalArg(args.slice(1), ["--label", "--init-script", "--headers"])');
  });

  it("supports best-effort runtime init script registration and removal", () => {
    const body = background();
    expect(body).toContain('case "addinitscript":');
    expect(body).toContain("return addInitScriptCommand(rest);");
    expect(body).toContain('case "removeinitscript":');
    expect(body).toContain("return removeInitScriptCommand(rest);");
    expect(body).toContain("const runtimeInitScripts = new Map");
    expect(body).toContain("async function addInitScriptCommand");
    expect(body).toContain("async function removeInitScriptCommand");
    expect(body).toContain('runAt: "document_start"');
    expect(body).toContain('"addinitscript"');
    expect(body).toContain('"removeinitscript"');
  });

  it("supports snapshot flags as opt-in behavior", () => {
    const body = background();
    expect(body).toContain("function parseSnapshotOptions");
    expect(body).toContain('args.includes("-i") || args.includes("--interactive")');
    expect(body).toContain("interactiveSnapshotFrames(frames)");
    expect(body).toContain("function isInteractiveSnapshotElement");
    expect(body).toContain('["heading", "iframe", "tab", "menuitem"]');
    expect(body).toContain('arg === "-s" || arg === "--scope"');
    expect(body).toContain('arg === "-d" || arg === "--depth"');
    expect(body).toContain('"--compact"');
    expect(body).toContain('"--urls"');
    expect(body).toContain("function parseSnapshotDepth");
    expect(body).toContain("function compactSnapshotFrames");
    expect(body).toContain("No element matched snapshot scope");
    expect(body).toContain('{ type: "snapshot", selector, depth }');

    const contentBody = content();
    expect(contentBody).toContain("snapshotFrame(message.selector, message.depth)");
    expect(contentBody).toContain("function snapshotRoot");
    expect(contentBody).toContain("function elementDepthWithinRoot");
    expect(contentBody).toContain("function hrefFor");
  });

  it("supports text-based snapshot diffs", () => {
    const body = background();
    expect(body).toContain('case "diff":');
    expect(body).toContain("return diffCommand(rest, params);");
    expect(body).toContain("const lastSnapshotTextByTabId = new Map");
    expect(body).toContain("lastSnapshotTextByTabId.set(tab.tabId, text);");
    expect(body).toContain("async function diffSnapshotCommand");
    expect(body).toContain("diffBaselineText");
    expect(body).toContain("No previous snapshot is available");
    expect(body).toContain("function unifiedTextDiff");
    expect(body).toContain("function compactDiffContext");
    expect(body).toContain("Screenshot, URL, and visual pixel diff commands are not supported yet.");
  });

  it("parses plain waits with positional milliseconds before timeout fallback", () => {
    const body = background();
    expect(body).toContain('firstPositionalArg(args, ["--selector", "--timeout", "--state"])');
    expect(body).toContain("if (positional !== undefined) return parsePositiveInteger(positional, \"wait\");");
    expect(body).toContain("return parseTimeoutOption(args, 1000);");
    expect(body).toContain("return { text: `Waited ${waitResult.ms}ms` };");
  });

  it("routes positional wait refs and selectors through locator resolution", () => {
    const body = background();
    expect(body).toContain('const target = firstPositionalArg(args, ["--selector", "--text", "--url", "--fn", "--download", "--timeout", "--state", "--load"])');
    expect(body).toContain("const locator = locatorFromTarget(target);");
    expect(body).toContain('type: "wait_locator"');

    const contentBody = content();
    expect(contentBody).toContain('message.type === "wait_locator"');
    expect(contentBody).toContain("function waitForLocator");
    expect(contentBody).toContain("const matches = resolve(locator).filter(isVisible);");
  });

  it("supports best-effort network route, abort, mock, and unroute commands", () => {
    const body = background();
    expect(body).toContain("registerNetworkRouteListener();");
    expect(body).toContain("function registerNetworkRouteListener");
    expect(body).toContain("browser.webRequest.onBeforeRequest.addListener(\n    applyNetworkRoute");
    expect(body).toContain('if (subcommand === "route") return networkRouteCommand(rest);');
    expect(body).toContain('if (subcommand === "unroute") return networkUnrouteCommand(rest);');
    expect(body).toContain("async function networkRouteCommand");
    expect(body).toContain("async function networkUnrouteCommand");
    expect(body).toContain('const id = `nr${nextNetworkRouteNumber++}`;');
    expect(body).toContain("route.tabId !== tab.tabId");
    expect(body).toContain('network route cannot combine --abort and --body');
    expect(body).toContain("function applyNetworkRoute");
    expect(body).toContain("return { cancel: true };");
    expect(body).toContain("return { redirectUrl: networkRouteDataUrl(route) };");
    expect(body).toContain("function networkRouteDataUrl");
    expect(body).toContain("routeAction: routeMatch?.action");
    expect(body).toContain("routeAction: record.routeAction");
    expect(body).toContain("route:${record.routeAction}");
    expect(body).toContain("networkRouteMatchesByRequestId.delete(id)");
  });

  it("exports metadata-only HAR files from captured network requests", () => {
    const body = background();
    expect(body).toContain('if (subcommand === "har" || subcommand === "export-har") return networkHarCommand(rest);');
    expect(body).toContain("async function networkHarCommand");
    expect(body).toContain("const networkHarRecordingStartedAtByTabId = new Map");
    expect(body).toContain("function networkHarMode");
    expect(body).toContain('if (args[0] === "start") return "start";');
    expect(body).toContain('if (args[0] === "stop") return "stop";');
    expect(body).toContain("Started HAR recording");
    expect(body).toContain("No HAR recording is active for the current tab");
    expect(body).toContain("function invalidNetworkHarArgs");
    expect(body).toContain("function networkHarForRecords");
    expect(body).toContain("function networkHarEntry");
    expect(body).toContain("function harQueryString");
    expect(body).toContain("Firefox WebExtension metadata export; bodies and headers are not captured.");
    expect(body).toContain("HAR export is built from Firefox WebExtension request metadata.");
    expect(body).toContain("Request/response headers");
    expect(body).toContain('"network requires requests|request|route|unroute|har|export-har"');
  });

  it("routes mouse commands through page-dispatched best-effort events", () => {
    const body = background();
    expect(body).toContain('case "mouse":');
    expect(body).toContain("return mouseCommand(rest);");
    expect(body).toContain("async function mouseCommand");
    expect(body).toContain('type: "mouse_event"');
    expect(body).toContain('"mouse requires move <x> <y>, down [button], up [button], or wheel <dy> [dx]"');
    expect(body).toContain("bestEffortWarning(");
    expect(body).toContain('"mouse"');

    const contentBody = content();
    expect(contentBody).toContain('message.type === "mouse_event"');
    expect(contentBody).toContain("function mouseEvent");
    expect(contentBody).toContain("new WheelEvent");
    expect(contentBody).toContain("dispatchPointerMouse");
    expect(contentBody).toContain("document.elementFromPoint");
  });

  it("routes drag commands through same-frame page drag/drop events", () => {
    const body = background();
    expect(body).toContain('case "drag":');
    expect(body).toContain("return dragCommand(rest);");
    expect(body).toContain("async function dragCommand");
    expect(body).toContain('type: "drag"');
    expect(body).toContain("sourceLocator");
    expect(body).toContain("targetLocator");
    expect(body).toContain("drag across different frames");
    expect(body).toContain('bestEffortWarning(\n        "drag"');

    const contentBody = content();
    expect(contentBody).toContain('message.type === "drag"');
    expect(contentBody).toContain("function dragLocator");
    expect(contentBody).toContain("new DataTransfer()");
    expect(contentBody).toContain('"dragstart"');
    expect(contentBody).toContain('"dragover"');
    expect(contentBody).toContain('"drop"');
    expect(contentBody).toContain('"dragend"');
  });

  it("routes auth commands through selector-driven best-effort profile login", () => {
    const body = background();
    expect(body).toContain('case "auth":');
    expect(body).toContain("return authCommand(rest, domainPolicy);");
    expect(body).toContain("async function authCommand");
    expect(body).toContain("async function authSaveCommand");
    expect(body).toContain("async function authLoginCommand");
    expect(body).toContain('AUTH_STORAGE_KEY = "pireBrowserAuthProfiles"');
    expect(body).toContain('"--username-selector"');
    expect(body).toContain('"--password-selector"');
    expect(body).toContain('"--submit-selector"');
    expect(body).toContain("authStorageWarning()");
    expect(body).toContain("not a full encrypted auth vault");

    const publicProfileBlock = body.match(/function publicAuthProfile[\s\S]*?function authStorageWarning/)?.[0] ?? "";
    expect(publicProfileBlock).toContain("username: profile.username");
    expect(publicProfileBlock).not.toContain("password");
  });

  it("rejects invalid waits and no longer caps plain waits at 1000ms", () => {
    const body = background();
    expect(body).toContain("Number.isInteger(ms)");
    expect(body).toContain("ms <= 0");
    expect(body).not.toContain("Math.min(timeout, 1000)");
    expect(body).not.toContain("Wait complete");
  });

  it("uses listener-plus-polling waits for Firefox tab load readiness", () => {
    const body = background();
    expect(body).toContain("const TAB_READY_POLL_INTERVAL_MS = 100");
    expect(body).toContain("async function waitForTabState");
    expect(body).toContain("await waitForTabState(tabId, timeout, (tab) => tab.status === \"complete\")");
    expect(body).toContain("browser.tabs.onUpdated.addListener(listener)");
    expect(body).toContain("browser.tabs.onUpdated.removeListener(listener)");
    expect(body).toContain("setInterval(() => void checkCurrent(), TAB_READY_POLL_INTERVAL_MS)");
    expect(body).toContain("void checkCurrent();");

    const helperBlock = body.match(/async function waitForTabState[\s\S]*?async function sendScreenshotChunks/)?.[0] ?? "";
    expect(helperBlock.indexOf("browser.tabs.onUpdated.addListener(listener)")).toBeGreaterThan(-1);
    expect(helperBlock.indexOf("void checkCurrent();")).toBeGreaterThan(
      helperBlock.indexOf("browser.tabs.onUpdated.addListener(listener)")
    );
  });
});
