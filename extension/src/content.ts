{
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

type DialogRecord = {
  type: "alert" | "confirm" | "prompt";
  message: string;
  defaultValue?: string;
  returned: boolean | string | null;
  at: number;
};

type ConsoleRecord = {
  level: "log" | "info" | "warn" | "error" | "debug";
  text: string;
  args: string[];
  at: number;
  url: string;
};

type PageErrorRecord = {
  type: "error" | "unhandledrejection";
  message: string;
  stack?: string;
  source?: string;
  lineno?: number;
  colno?: number;
  at: number;
  url: string;
};

type PageEvaluation =
  | { ok: true; value: unknown; text: string; truthy: boolean }
  | { ok: false; message: string };

type VitalsMetric = {
  name: string;
  value: number | null;
  unit: "ms" | "score";
  rating: "good" | "needs-improvement" | "poor" | "unknown";
  available: boolean;
  source: string;
};

const MAX_PAGE_LOG_RECORDS = 200;
const dialogs: DialogRecord[] = [];
const consoleRecords: ConsoleRecord[] = [];
const pageErrorRecords: PageErrorRecord[] = [];
let nextHandleNumber = 1;
const handlesByElement = new WeakMap<Element, string>();
const elementsByHandle = new Map<string, Element>();
let mouseX = Math.round(window.innerWidth / 2);
let mouseY = Math.round(window.innerHeight / 2);

injectDialogShim();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "pire-browser") return;
  if (data.kind === "dialog") {
    pushCapped(dialogs, data.payload as DialogRecord, 10);
    return;
  }
  if (data.kind === "console") {
    pushCapped(consoleRecords, data.payload as ConsoleRecord, MAX_PAGE_LOG_RECORDS);
    return;
  }
  if (data.kind === "page_error") {
    pushCapped(pageErrorRecords, data.payload as PageErrorRecord, MAX_PAGE_LOG_RECORDS);
  }
});

browser.runtime.onMessage.addListener((message: any) => {
  if (!message || typeof message.type !== "string") return undefined;
  if (message.type === "dialog_status") return Promise.resolve(dialogStatus());
  if (message.type === "dialog_control") return Promise.resolve(configureNextDialog(message.action, message.text));
  if (message.type === "snapshot") return Promise.resolve(snapshotFrame(message.selector, message.depth));
  if (message.type === "find") return Promise.resolve(findElements(message.locator));
  if (message.type === "frame_target") return Promise.resolve(frameTargetLocator(message.locator));
  if (message.type === "click") return Promise.resolve(clickLocator(message.locator));
  if (message.type === "click_new_tab") return Promise.resolve(clickNewTabLocator(message.locator));
  if (message.type === "dblclick") return Promise.resolve(doubleClickLocator(message.locator));
  if (message.type === "fill") return Promise.resolve(fillLocator(message.locator, message.text ?? ""));
  if (message.type === "upload_files") return Promise.resolve(uploadFilesLocator(message.locator, message.files));
  if (message.type === "type") return Promise.resolve(typeLocator(message.locator, message.text ?? ""));
  if (message.type === "focus") return Promise.resolve(focusLocator(message.locator));
  if (message.type === "hover") return Promise.resolve(hoverLocator(message.locator));
  if (message.type === "highlight") return Promise.resolve(highlightLocator(message.locator));
  if (message.type === "drag") return Promise.resolve(dragLocator(message.sourceLocator, message.targetLocator));
  if (message.type === "select") return Promise.resolve(selectLocator(message.locator, message.value ?? ""));
  if (message.type === "check") return Promise.resolve(checkLocator(message.locator, true));
  if (message.type === "uncheck") return Promise.resolve(checkLocator(message.locator, false));
  if (message.type === "scrollintoview") return Promise.resolve(scrollIntoViewLocator(message.locator));
  if (message.type === "get") return Promise.resolve(getLocator(message.locator, String(message.property ?? "text"), message.attribute));
  if (message.type === "is") return Promise.resolve(isLocator(message.locator, String(message.state ?? "visible")));
  if (message.type === "press") return Promise.resolve(pressKey(String(message.key ?? "")));
  if (message.type === "key_edge") return Promise.resolve(keyEdge(String(message.action ?? ""), String(message.key ?? "")));
  if (message.type === "keyboard_type") return Promise.resolve(typeFocused(String(message.text ?? ""), true));
  if (message.type === "keyboard_inserttext") return Promise.resolve(typeFocused(String(message.text ?? ""), false));
  if (message.type === "clipboard_selection") return Promise.resolve(clipboardSelection());
  if (message.type === "clipboard_paste") return Promise.resolve(clipboardPaste(String(message.text ?? "")));
  if (message.type === "state_export_storage") return Promise.resolve(stateExportStorage());
  if (message.type === "state_import_storage") return Promise.resolve(stateImportStorage(message.localStorage, message.sessionStorage));
  if (message.type === "viewport_metrics") return Promise.resolve(viewportMetrics());
  if (message.type === "screenshot_annotate") return Promise.resolve(annotateScreenshot(Boolean(message.fullPage)));
  if (message.type === "screenshot_full_metrics") return Promise.resolve(screenshotFullMetrics());
  if (message.type === "screenshot_scroll") return screenshotScroll(Number(message.x ?? 0), Number(message.y ?? 0));
  if (message.type === "screenshot_clear_annotations") return Promise.resolve(clearScreenshotAnnotationsResult());
  if (message.type === "scroll") {
    return Promise.resolve(scrollPage(String(message.direction ?? "down"), Number(message.pixels ?? 900), message.selector));
  }
  if (message.type === "mouse_event") {
    return Promise.resolve(mouseEvent(String(message.action ?? ""), Number(message.x), Number(message.y), Number(message.button ?? 0), Number(message.dx ?? 0), Number(message.dy ?? 0)));
  }
  if (message.type === "wait_selector") {
    return waitForSelector(String(message.selector), Number(message.timeout ?? 10_000), String(message.state ?? "visible"));
  }
  if (message.type === "wait_locator") {
    return waitForLocator(message.locator, Number(message.timeout ?? 10_000), String(message.state ?? "visible"));
  }
  if (message.type === "wait_text") return waitForText(String(message.text ?? ""), Number(message.timeout ?? 10_000), Boolean(message.hidden));
  if (message.type === "wait_fn") return waitForFunction(String(message.expression ?? ""), Number(message.timeout ?? 10_000));
  if (message.type === "debug_logs") return Promise.resolve(debugLogs(String(message.kind ?? "console"), Boolean(message.clear)));
  if (message.type === "vitals") return Promise.resolve(pageVitals());
  if (message.type === "eval") return Promise.resolve(evalScript(String(message.script ?? "")));
  if (message.type === "pushstate") return pushStateNavigation(String(message.url ?? ""));
  return undefined;
});

function injectDialogShim() {
  try {
    const script = document.createElement("script");
    script.textContent = `
      (() => {
        if (window.__pireBrowserDialogShimInstalled) return;
        const emit = (payload, kind = "dialog") => window.postMessage({ source: "pire-browser", kind, payload }, "*");
        const originalAlert = window.alert.bind(window);
        const originalConfirm = window.confirm.bind(window);
        const originalPrompt = window.prompt.bind(window);
        let nextDialogResponse = null;
        Object.defineProperty(window, "__pireBrowserDialogShimInstalled", {
          value: true,
          configurable: false,
          enumerable: false,
          writable: false,
        });
        Object.defineProperty(window, "__pireBrowserOriginalDialogs", {
          value: { alert: originalAlert, confirm: originalConfirm, prompt: originalPrompt },
          configurable: false,
          enumerable: false,
          writable: false,
        });
        const consumeResponse = () => {
          const response = nextDialogResponse;
          nextDialogResponse = null;
          return response;
        };
        window.addEventListener("message", (event) => {
          if (event.source !== window) return;
          const data = event.data;
          if (!data || data.source !== "pire-browser" || data.kind !== "dialog_control") return;
          nextDialogResponse = {
            action: data.action === "accept" ? "accept" : "dismiss",
            text: typeof data.text === "string" ? data.text : undefined,
          };
        });
        window.alert = (message) => {
          const response = consumeResponse();
          emit({ type: "alert", message: String(message ?? ""), returned: true, configuredAction: response?.action, at: Date.now() });
        };
        window.confirm = (message) => {
          const response = consumeResponse();
          const returned = response?.action === "accept";
          emit({ type: "confirm", message: String(message ?? ""), returned, configuredAction: response?.action, at: Date.now() });
          return returned;
        };
        window.prompt = (message, defaultValue) => {
          const response = consumeResponse();
          const returned = response?.action === "accept" ? (response.text ?? String(defaultValue ?? "")) : null;
          emit({ type: "prompt", message: String(message ?? ""), defaultValue, returned, configuredAction: response?.action, at: Date.now() });
          return returned;
        };
        const truncate = (text, max = 2000) => text.length > max ? text.slice(0, max - 1) + "…" : text;
        const valueText = (value) => {
          try {
            if (value instanceof Error) return value.stack || value.message || String(value);
            if (typeof value === "string") return value;
            if (value === undefined) return "undefined";
            if (typeof value === "function") return value.toString();
            if (typeof value === "symbol") return value.toString();
            if (value && typeof value === "object") return JSON.stringify(value);
            return String(value);
          } catch {
            try {
              return String(value);
            } catch {
              return "[unserializable]";
            }
          }
        };
        const consoleLevels = ["log", "info", "warn", "error", "debug"];
        for (const level of consoleLevels) {
          const original = window.console && typeof window.console[level] === "function"
            ? window.console[level].bind(window.console)
            : undefined;
          if (!original) continue;
          window.console[level] = (...args) => {
            const serialized = args.map((arg) => truncate(valueText(arg)));
            emit({ level, text: serialized.join(" "), args: serialized, at: Date.now(), url: location.href }, "console");
            return original(...args);
          };
        }
        window.addEventListener("error", (event) => {
          const error = event.error;
          emit({
            type: "error",
            message: truncate(String(event.message || error?.message || "")),
            stack: error?.stack ? truncate(String(error.stack), 8000) : undefined,
            source: event.filename || undefined,
            lineno: typeof event.lineno === "number" ? event.lineno : undefined,
            colno: typeof event.colno === "number" ? event.colno : undefined,
            at: Date.now(),
            url: location.href,
          }, "page_error");
        });
        window.addEventListener("unhandledrejection", (event) => {
          const reason = event.reason;
          emit({
            type: "unhandledrejection",
            message: truncate(valueText(reason)),
            stack: reason && reason.stack ? truncate(String(reason.stack), 8000) : undefined,
            at: Date.now(),
            url: location.href,
          }, "page_error");
        });
      })();
    `;
    (document.documentElement || document.head).appendChild(script);
    script.remove();
  } catch {
    // Restricted pages can reject script injection; commands will continue without dialog capture.
  }
}

function snapshotFrame(selector?: unknown, depth?: unknown): FrameSnapshot {
  const root = snapshotRoot(selector);
  const drained = drainDialogs();
  if ("error" in root) {
    return {
      frameId: 0,
      url: location.href,
      title: document.title,
      elements: [],
      dialogs: drained,
      error: root.error,
    };
  }
  const maxDepth = typeof depth === "number" && Number.isFinite(depth) ? depth : undefined;
  const elements = candidateElements(root.root)
    .filter((element) => maxDepth === undefined || elementDepthWithinRoot(element, root.root) <= maxDepth)
    .map((element) => toSnapshot(element, root.root))
    .filter((item) => item.visible);
  return {
    frameId: 0,
    url: location.href,
    title: document.title,
    elements,
    dialogs: drained,
  };
}

function elementDepthWithinRoot(element: Element, root: ParentNode): number {
  const base = root instanceof Document ? root.body || root.documentElement : root instanceof Element ? root : null;
  if (!base) return 0;
  if (element === base) return 0;

  let depth = 0;
  let current: Element | null = element;
  while (current && current !== base) {
    depth += 1;
    current = current.parentElement;
  }
  return current === base ? depth : Number.MAX_SAFE_INTEGER;
}

function snapshotRoot(selector?: unknown): { root: ParentNode } | { error: string } {
  if (selector === undefined || selector === null || selector === "") return { root: document };
  try {
    const root = document.querySelector(String(selector));
    if (!root) return { error: `No element matched snapshot scope: ${selector}` };
    return { root };
  } catch (error) {
    return { error: error instanceof Error ? error.message : `Invalid snapshot scope: ${selector}` };
  }
}

function findElements(locator: Locator) {
  const matches = resolve(locator).map((element) => toSnapshot(element));
  return {
    matches,
    dialogs: drainDialogs(),
  };
}

function frameTargetLocator(locator: Locator) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element;
  if (!isFrameElement(element)) {
    return {
      error: { code: "unsupported_element", message: `${describeElement(element)} is not an iframe` },
      dialogs: drainDialogs(),
    };
  }
  return {
    text: `Frame target ${accessibleName(element) || attr(element, "src") || describeElement(element)}`,
    href: frameSourceFor(element),
    frameUrl: currentFrameUrlFor(element),
    title: attr(element, "title"),
    name: attr(element, "name"),
    dialogs: drainDialogs(),
  };
}

function clickLocator(locator: Locator) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  if (isDisabled(element)) {
    return { error: { code: "not_enabled", message: `${describeElement(element)} is disabled` }, dialogs: drainDialogs() };
  }
  element.scrollIntoView({ block: "center", inline: "center" });
  const hitTest = clickHitTest(element);
  if ("error" in hitTest) return { ...hitTest, dialogs: drainDialogs() };
  element.focus({ preventScroll: true });
  element.click();
  return {
    text: `Clicked ${describeElement(element)}`,
    dialogs: drainDialogs(),
  };
}

function clickNewTabLocator(locator: Locator) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  if (isDisabled(element)) {
    return { error: { code: "not_enabled", message: `${describeElement(element)} is disabled` }, dialogs: drainDialogs() };
  }
  const href = linkHrefFor(element);
  if (!href) {
    return {
      error: {
        code: "unsupported_element",
        message: `click --new-tab requires a link with href, got ${describeElement(element)}`,
      },
      dialogs: drainDialogs(),
    };
  }
  element.scrollIntoView({ block: "center", inline: "center" });
  const hitTest = clickHitTest(element);
  if ("error" in hitTest) return { ...hitTest, dialogs: drainDialogs() };
  element.focus({ preventScroll: true });
  for (const type of ["mousedown", "mouseup", "click"]) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ctrlKey: true }));
  }
  return {
    text: `Clicked ${describeElement(element)} for new tab`,
    href,
    value: href,
    dialogs: drainDialogs(),
  };
}

function doubleClickLocator(locator: Locator) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  if (isDisabled(element)) {
    return { error: { code: "not_enabled", message: `${describeElement(element)} is disabled` }, dialogs: drainDialogs() };
  }
  element.scrollIntoView({ block: "center", inline: "center" });
  const hitTest = clickHitTest(element);
  if ("error" in hitTest) return { ...hitTest, dialogs: drainDialogs() };
  element.focus({ preventScroll: true });
  for (const detail of [1, 2]) {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, detail }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, detail }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));
  }
  element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }));
  return {
    text: `Double-clicked ${describeElement(element)}`,
    dialogs: drainDialogs(),
  };
}

function clickHitTest(element: Element) {
  const point = visibleClickPoint(element);
  if ("error" in point) return point;
  const hit = document.elementFromPoint(point.x, point.y);
  if (!hit) {
    return {
      error: {
        code: "click_blocked",
        message: `${describeElement(element)} is not hit-testable at click point (${point.x}, ${point.y})`,
        data: { target: describeElement(element), point },
      },
    };
  }
  if (isElementOrShadowDescendant(element, hit)) return { point, hit };
  return {
    error: {
      code: "click_blocked",
      message: `${describeElement(element)} is covered by ${describeDomElement(hit)} at click point (${point.x}, ${point.y}). Dismiss or interact with the covering element, then run snapshot -i before retrying.`,
      data: {
        target: describeElement(element),
        coveredBy: describeDomElement(hit),
        point,
      },
    },
  };
}

function visibleClickPoint(element: Element) {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { error: { code: "not_visible", message: `${describeElement(element)} has no visible click area` } };
  }
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewportWidth, rect.right);
  const bottom = Math.min(viewportHeight, rect.bottom);
  if (right <= left || bottom <= top) {
    return {
      error: {
        code: "not_visible",
        message: `${describeElement(element)} is outside the visible viewport after scrolling`,
      },
    };
  }
  return {
    x: Math.max(0, Math.min(viewportWidth - 1, Math.round((left + right) / 2))),
    y: Math.max(0, Math.min(viewportHeight - 1, Math.round((top + bottom) / 2))),
  };
}

function isElementOrShadowDescendant(target: Element, hit: Element): boolean {
  if (target === hit || target.contains(hit)) return true;
  const root = hit.getRootNode();
  return root instanceof ShadowRoot && (target === root.host || target.contains(root.host));
}

function describeDomElement(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = attr(element, "id");
  const classNames = attr(element, "class")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((name) => `.${name.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
    .join("");
  const role = attr(element, "role");
  const name = accessibleName(element) || clean(element.textContent ?? "").slice(0, 60);
  return `<${tag}${id ? `#${id.replace(/[^a-zA-Z0-9_-]/g, "_")}` : ""}${classNames}>${role ? ` role=${role}` : ""}${name ? ` "${name}"` : ""}`;
}

function highlightLocator(locator: Locator) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  clearHighlights();
  const overlay = document.createElement("div");
  overlay.setAttribute("data-pire-browser-highlight", "true");
  overlay.setAttribute("aria-hidden", "true");
  overlay.style.cssText = [
    "position: fixed",
    `left: ${Math.max(0, Math.round(rect.left))}px`,
    `top: ${Math.max(0, Math.round(rect.top))}px`,
    `width: ${Math.max(1, Math.round(rect.width))}px`,
    `height: ${Math.max(1, Math.round(rect.height))}px`,
    "box-sizing: border-box",
    "border: 4px solid #ff2d55",
    "background: rgba(255, 45, 85, 0.16)",
    "box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.08), 0 0 18px rgba(255, 45, 85, 0.75)",
    "border-radius: 6px",
    "pointer-events: none",
    "z-index: 2147483647",
  ].join(";");
  document.documentElement.appendChild(overlay);
  return {
    text: `Highlighted ${describeElement(element)}`,
    highlighted: describeElement(element),
    bounds: rectObject(rect),
    dialogs: drainDialogs(),
  };
}

function clearHighlights() {
  document.querySelectorAll("[data-pire-browser-highlight='true']").forEach((node) => node.remove());
}

function annotateScreenshot(fullPage = false) {
  clearScreenshotAnnotations();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const metrics = screenshotFullMetrics();
  const scrollX = window.scrollX || 0;
  const scrollY = window.scrollY || 0;
  const items = candidateElements(document)
    .filter((element) => !element.closest?.("[data-pire-browser-screenshot-annotation='true']"))
    .map((element) => ({ element, snapshot: toSnapshot(element) }))
    .filter(({ snapshot }) => isAnnotatableRole(snapshot.role))
    .filter(({ snapshot }) => snapshot.visible && snapshot.bounds.width > 2 && snapshot.bounds.height > 2)
    .filter(({ snapshot }) => fullPage || rectIntersectsViewport(snapshot.bounds, viewportWidth, viewportHeight))
    .sort((left, right) => {
      const leftY = fullPage ? left.snapshot.bounds.y + scrollY : Math.max(0, left.snapshot.bounds.y);
      const rightY = fullPage ? right.snapshot.bounds.y + scrollY : Math.max(0, right.snapshot.bounds.y);
      const y = leftY - rightY;
      if (y) return y;
      const leftX = fullPage ? left.snapshot.bounds.x + scrollX : Math.max(0, left.snapshot.bounds.x);
      const rightX = fullPage ? right.snapshot.bounds.x + scrollX : Math.max(0, right.snapshot.bounds.x);
      return leftX - rightX;
    })
    .slice(0, fullPage ? 120 : 80);

  const root = document.documentElement || document.body;
  const container = document.createElement("div");
  container.setAttribute("data-pire-browser-screenshot-annotation", "true");
  container.setAttribute("aria-hidden", "true");
  Object.assign(container.style, {
    position: fullPage ? "absolute" : "fixed",
    left: "0",
    top: "0",
    width: fullPage ? `${metrics.documentWidth}px` : "100vw",
    height: fullPage ? `${metrics.documentHeight}px` : "100vh",
    pointerEvents: "none",
    zIndex: "2147483647",
  });

  const annotations = items.map(({ snapshot }, index) => {
    const label = String(index + 1);
    const bounds = fullPage
      ? {
          x: Math.max(0, snapshot.bounds.x + scrollX),
          y: Math.max(0, snapshot.bounds.y + scrollY),
          width: snapshot.bounds.width,
          height: snapshot.bounds.height,
        }
      : clipBoundsToViewport(snapshot.bounds, viewportWidth, viewportHeight);
    const box = document.createElement("div");
    box.setAttribute("data-pire-browser-screenshot-annotation", "true");
    Object.assign(box.style, {
      position: "absolute",
      left: `${bounds.x}px`,
      top: `${bounds.y}px`,
      width: `${Math.max(1, bounds.width)}px`,
      height: `${Math.max(1, bounds.height)}px`,
      border: "2px solid #ff2d55",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.9), 0 1px 4px rgba(0,0,0,0.35)",
      boxSizing: "border-box",
      borderRadius: "4px",
    });

    const badge = document.createElement("div");
    badge.textContent = label;
    Object.assign(badge.style, {
      position: "absolute",
      left: "-2px",
      top: "-2px",
      minWidth: "18px",
      height: "18px",
      padding: "0 4px",
      borderRadius: "9px",
      background: "#ff2d55",
      color: "#ffffff",
      font: "700 12px/18px Arial, sans-serif",
      textAlign: "center",
      boxShadow: "0 1px 3px rgba(0,0,0,0.35)",
    });
    box.appendChild(badge);
    container.appendChild(box);

    return {
      label,
      role: snapshot.role,
      name: snapshot.name || snapshot.label || snapshot.placeholder || snapshot.text,
      locator: snapshot.locator,
      bounds: snapshot.bounds,
    };
  });

  root.appendChild(container);
  return {
    text: `Annotated ${annotations.length} ${fullPage ? "document" : "visible"} element(s)`,
    annotated: annotations.length,
    annotations,
    warnings: annotations.length ? [] : ["No visible elements were available to annotate."],
    dialogs: drainDialogs(),
  };
}

function clearScreenshotAnnotationsResult() {
  const cleared = clearScreenshotAnnotations();
  return { text: `Cleared ${cleared} screenshot annotation overlay(s)`, cleared, dialogs: drainDialogs() };
}

function screenshotFullMetrics() {
  const doc = document.documentElement;
  const body = document.body;
  const viewportWidth = Math.max(1, window.innerWidth || doc.clientWidth || 1);
  const viewportHeight = Math.max(1, window.innerHeight || doc.clientHeight || 1);
  const documentWidth = Math.max(
    viewportWidth,
    doc.scrollWidth,
    body?.scrollWidth ?? 0,
    doc.offsetWidth,
    body?.offsetWidth ?? 0
  );
  const documentHeight = Math.max(
    viewportHeight,
    doc.scrollHeight,
    body?.scrollHeight ?? 0,
    doc.offsetHeight,
    body?.offsetHeight ?? 0
  );
  return {
    text: `${documentWidth}x${documentHeight}`,
    viewportWidth,
    viewportHeight,
    documentWidth,
    documentHeight,
    maxScrollX: Math.max(0, documentWidth - viewportWidth),
    maxScrollY: Math.max(0, documentHeight - viewportHeight),
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio || 1,
    dialogs: drainDialogs(),
  };
}

async function screenshotScroll(x: number, y: number) {
  window.scrollTo(Math.max(0, x), Math.max(0, y));
  await nextAnimationFrame();
  await nextAnimationFrame();
  return {
    text: `Scrolled to ${Math.round(window.scrollX)},${Math.round(window.scrollY)}`,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    dialogs: drainDialogs(),
  };
}

function nextAnimationFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

function clearScreenshotAnnotations() {
  const nodes = Array.from(document.querySelectorAll("[data-pire-browser-screenshot-annotation='true']"));
  nodes.forEach((node) => node.remove());
  return nodes.length;
}

function isAnnotatableRole(role: string) {
  return ["button", "link", "textbox", "checkbox", "radio", "combobox", "slider", "iframe"].includes(role);
}

function rectIntersectsViewport(bounds: { x: number; y: number; width: number; height: number }, viewportWidth: number, viewportHeight: number) {
  return bounds.x + bounds.width > 0 && bounds.y + bounds.height > 0 && bounds.x < viewportWidth && bounds.y < viewportHeight;
}

function clipBoundsToViewport(bounds: { x: number; y: number; width: number; height: number }, viewportWidth: number, viewportHeight: number) {
  const x = Math.max(0, bounds.x);
  const y = Math.max(0, bounds.y);
  const right = Math.min(viewportWidth, bounds.x + bounds.width);
  const bottom = Math.min(viewportHeight, bounds.y + bounds.height);
  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  };
}

function fillLocator(locator: Locator, text: string) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  element.scrollIntoView({ block: "center", inline: "center" });
  element.focus({ preventScroll: true });

  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox" || element.type === "radio") {
      const checked = ["true", "1", "yes", "on", "checked"].includes(text.toLowerCase());
      element.checked = checked;
      fireInputEvents(element);
    } else {
      setNativeValue(element, text);
      fireInputEvents(element);
    }
  } else if (element instanceof HTMLTextAreaElement) {
    setNativeValue(element, text);
    fireInputEvents(element);
  } else if (element instanceof HTMLSelectElement) {
    element.value = text;
    fireInputEvents(element);
  } else if (element.isContentEditable) {
    element.textContent = text;
    fireInputEvents(element);
  } else {
    return {
      error: {
        code: "unsupported_element",
        message: `Cannot fill ${describeElement(element)}`,
      },
      dialogs: drainDialogs(),
    };
  }

  return {
    text: `Filled ${describeElement(element)}`,
    dialogs: drainDialogs(),
  };
}

function uploadFilesLocator(locator: Locator, rawFiles: unknown) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const input = fileInputForUploadTarget(resolved.element);
  if ("error" in input) return input;
  if (input.element.disabled) {
    return { error: { code: "not_enabled", message: `${describeElement(input.element)} is disabled` }, dialogs: drainDialogs() };
  }
  const parsed = parseUploadFiles(rawFiles);
  if ("error" in parsed) return parsed;
  if (parsed.files.length > 1 && !input.element.multiple) {
    return {
      error: {
        code: "InvalidArgumentError",
        message: `${describeElement(input.element)} does not accept multiple files`,
      },
      dialogs: drainDialogs(),
    };
  }

  const transfer = new DataTransfer();
  for (const file of parsed.files) {
    transfer.items.add(file.file);
  }
  try {
    input.element.files = transfer.files;
  } catch (error) {
    return {
      error: {
        code: "InvalidArgumentError",
        message: `Firefox did not allow assigning files to ${describeElement(input.element)}: ${error instanceof Error ? error.message : String(error)}`,
      },
      dialogs: drainDialogs(),
    };
  }
  input.element.dispatchEvent(new Event("input", { bubbles: true }));
  input.element.dispatchEvent(new Event("change", { bubbles: true }));
  const totalBytes = parsed.files.reduce((sum, item) => sum + item.size, 0);
  const files = parsed.files.map((item) => ({ name: item.name, size: item.size, type: item.type }));
  return {
    text: `Uploaded ${files.length} file(s) to ${describeElement(input.element)} (${totalBytes} byte(s))`,
    target: describeElement(input.element),
    fileCount: files.length,
    files,
    totalBytes,
    dialogs: drainDialogs(),
  };
}

function fileInputForUploadTarget(element: Element): { element: HTMLInputElement } | { error: Record<string, string>; dialogs: DialogRecord[] } {
  if (element instanceof HTMLInputElement && element.type === "file") {
    return { element };
  }
  if (element instanceof HTMLLabelElement && element.control instanceof HTMLInputElement && element.control.type === "file") {
    return { element: element.control };
  }
  if (element instanceof HTMLElement) {
    const nested = element.querySelector("input[type=file]");
    if (nested instanceof HTMLInputElement) return { element: nested };
  }
  return {
    error: {
      code: "InvalidArgumentError",
      message: `Upload target must be an input[type=file] or associated label, got ${describeElement(element)}`,
    },
    dialogs: drainDialogs(),
  };
}

function parseUploadFiles(rawFiles: unknown):
  | { files: { file: File; name: string; size: number; type: string }[] }
  | { error: Record<string, string>; dialogs: DialogRecord[] } {
  if (!Array.isArray(rawFiles) || rawFiles.length === 0) {
    return { error: { code: "InvalidArgumentError", message: "upload requires file payloads" }, dialogs: drainDialogs() };
  }
  const files = [];
  for (const raw of rawFiles) {
    if (!raw || typeof raw !== "object") {
      return { error: { code: "InvalidArgumentError", message: "upload file payload is malformed" }, dialogs: drainDialogs() };
    }
    const item = raw as Record<string, unknown>;
    const name = typeof item.name === "string" ? item.name : "";
    const type = typeof item.mimeType === "string" ? item.mimeType : "application/octet-stream";
    const bytesBase64 = typeof item.bytesBase64 === "string" ? item.bytesBase64 : "";
    const expectedSize = typeof item.size === "number" ? item.size : -1;
    if (!name || !bytesBase64 || expectedSize < 0) {
      return { error: { code: "InvalidArgumentError", message: "upload file payload is missing name, bytes, or size" }, dialogs: drainDialogs() };
    }
    const bytes = decodeBase64Bytes(bytesBase64);
    if ("error" in bytes) return bytes;
    if (bytes.bytes.byteLength !== expectedSize) {
      return { error: { code: "InvalidArgumentError", message: `upload file ${name} size did not match payload metadata` }, dialogs: drainDialogs() };
    }
    const arrayBuffer = new ArrayBuffer(bytes.bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes.bytes);
    files.push({
      file: new File([arrayBuffer], name, { type }),
      name,
      size: expectedSize,
      type,
    });
  }
  return { files };
}

function decodeBase64Bytes(value: string): { bytes: Uint8Array } | { error: Record<string, string>; dialogs: DialogRecord[] } {
  try {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }
    return { bytes };
  } catch (error) {
    return {
      error: {
        code: "InvalidArgumentError",
        message: `upload file payload is not valid base64: ${error instanceof Error ? error.message : String(error)}`,
      },
      dialogs: drainDialogs(),
    };
  }
}

function typeLocator(locator: Locator, text: string) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  element.scrollIntoView({ block: "center", inline: "center" });
  element.focus({ preventScroll: true });
  for (const char of text) {
    dispatchKey(element, char, "keydown");
    dispatchKey(element, char, "keypress");
    insertText(element, char);
    dispatchKey(element, char, "keyup");
  }
  return { text: `Typed into ${describeElement(element)}`, dialogs: drainDialogs() };
}

function focusLocator(locator: Locator) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  element.scrollIntoView({ block: "center", inline: "center" });
  element.focus({ preventScroll: true });
  return { text: `Focused ${describeElement(element)}`, dialogs: drainDialogs() };
}

function hoverLocator(locator: Locator) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  element.scrollIntoView({ block: "center", inline: "center" });
  const rect = element.getBoundingClientRect();
  const clientX = Math.round(rect.left + rect.width / 2);
  const clientY = Math.round(rect.top + rect.height / 2);
  for (const type of ["pointerover", "pointerenter", "mouseover", "mouseenter", "mousemove"]) {
    element.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY }));
  }
  return {
    text: `Hovered ${describeElement(element)}`,
    warnings: [bestEffortWarning("hover", "Firefox WebExtensions can dispatch hover events but cannot force native :hover state.")],
    dialogs: drainDialogs(),
  };
}

function dragLocator(sourceLocator: Locator, targetLocator: Locator) {
  const source = resolveOne(sourceLocator);
  if ("error" in source) return source;
  const target = resolveOne(targetLocator);
  if ("error" in target) return target;

  const sourceElement = source.element as HTMLElement;
  const targetElement = target.element as HTMLElement;
  sourceElement.scrollIntoView({ block: "center", inline: "center" });
  targetElement.scrollIntoView({ block: "center", inline: "center" });
  const sourcePoint = elementCenter(sourceElement);
  const targetPoint = elementCenter(targetElement);
  const dataTransfer = new DataTransfer();

  dispatchPointerMouseAt(sourceElement, "pointerover", sourcePoint);
  dispatchPointerMouseAt(sourceElement, "mouseover", sourcePoint);
  dispatchPointerMouseAt(sourceElement, "pointerdown", sourcePoint);
  dispatchPointerMouseAt(sourceElement, "mousedown", sourcePoint);
  dispatchDrag(sourceElement, "dragstart", sourcePoint, dataTransfer);
  dispatchPointerMouseAt(targetElement, "pointermove", targetPoint);
  dispatchPointerMouseAt(targetElement, "mousemove", targetPoint);
  dispatchDrag(targetElement, "dragenter", targetPoint, dataTransfer);
  dispatchDrag(targetElement, "dragover", targetPoint, dataTransfer);
  dispatchDrag(targetElement, "drop", targetPoint, dataTransfer);
  dispatchDrag(sourceElement, "dragend", targetPoint, dataTransfer);
  dispatchPointerMouseAt(targetElement, "pointerup", targetPoint);
  dispatchPointerMouseAt(targetElement, "mouseup", targetPoint);

  return {
    text: `Dragged ${describeElement(sourceElement)} to ${describeElement(targetElement)}`,
    source: describeElement(sourceElement),
    target: describeElement(targetElement),
    dialogs: drainDialogs(),
  };
}

function elementCenter(element: Element) {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.left + rect.width / 2),
    y: Math.round(rect.top + rect.height / 2),
  };
}

function dispatchPointerMouseAt(target: Element, type: string, point: { x: number; y: number }) {
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: point.x,
    clientY: point.y,
    button: 0,
    buttons: type.endsWith("down") ? 1 : 0,
  };
  const EventConstructor = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
  target.dispatchEvent(new EventConstructor(type, eventInit));
}

function dispatchDrag(target: Element, type: string, point: { x: number; y: number }, dataTransfer: DataTransfer) {
  let event: Event;
  if (typeof DragEvent !== "undefined") {
    event = new DragEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: point.x,
      clientY: point.y,
      dataTransfer,
    });
  } else {
    event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: point.x,
      clientY: point.y,
    });
    Object.defineProperty(event, "dataTransfer", { value: dataTransfer });
  }
  target.dispatchEvent(event);
}

function selectLocator(locator: Locator, value: string) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element;
  if (!(element instanceof HTMLSelectElement)) {
    return { error: { code: "unsupported_element", message: `Cannot select ${describeElement(element)}` }, dialogs: drainDialogs() };
  }
  const option = Array.from(element.options).find((item) => item.value === value || clean(item.textContent ?? "") === value);
  if (!option) return { error: { code: "not_found", message: `No option matched ${value}` }, dialogs: drainDialogs() };
  element.value = option.value;
  fireInputEvents(element);
  return { text: `Selected ${value} in ${describeElement(element)}`, dialogs: drainDialogs() };
}

function checkLocator(locator: Locator, checked: boolean) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element;
  if (!(element instanceof HTMLInputElement) || !["checkbox", "radio"].includes(element.type)) {
    return { error: { code: "unsupported_element", message: `Cannot ${checked ? "check" : "uncheck"} ${describeElement(element)}` }, dialogs: drainDialogs() };
  }
  element.checked = checked;
  fireInputEvents(element);
  return { text: `${checked ? "Checked" : "Unchecked"} ${describeElement(element)}`, dialogs: drainDialogs() };
}

function scrollIntoViewLocator(locator: Locator) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  element.scrollIntoView({ block: "center", inline: "center" });
  return { text: `Scrolled ${describeElement(element)} into view`, dialogs: drainDialogs() };
}

function getLocator(locator: Locator, property: string, attribute?: unknown) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  const value =
    property === "html"
      ? element.innerHTML
      : property === "value"
        ? elementValue(element)
        : property === "attr"
          ? attr(element, String(attribute ?? ""))
          : property === "box"
          ? rectObject(element.getBoundingClientRect())
            : property === "styles"
              ? computedStyles(element)
              : clean(element.textContent ?? "");
  return { text: typeof value === "string" ? value : JSON.stringify(value), value, dialogs: drainDialogs() };
}

function isLocator(locator: Locator, state: string) {
  const matches = resolve(locator);
  const element = matches[0];
  const value =
    state === "visible"
      ? Boolean(element && isVisible(element))
      : state === "enabled"
        ? Boolean(element && !isDisabled(element))
        : state === "checked"
          ? Boolean(element instanceof HTMLInputElement && element.checked)
          : false;
  return { text: String(value), value, dialogs: drainDialogs() };
}

function pressKey(key: string) {
  const target = (document.activeElement || document.body) as HTMLElement;
  const parsed = parseKeyChord(key);
  const normalized = parsed.key.length === 1 ? parsed.key : keyName(parsed.key);
  const keydownAccepted = dispatchKey(target, normalized, "keydown", parsed);
  if (normalized === "Enter" && target instanceof HTMLInputElement && !parsed.ctrlKey && !parsed.metaKey && !parsed.altKey) {
    const keypressAccepted = dispatchKey(target, normalized, "keypress", parsed);
    submitFormForEnter(target, keydownAccepted || keypressAccepted);
  }
  if (normalized.length === 1 && isTextLike(target) && !parsed.ctrlKey && !parsed.metaKey && !parsed.altKey) {
    insertText(target, normalized);
  }
  dispatchKey(target, normalized, "keyup", parsed);
  return {
    text: `Pressed ${normalized}`,
    dialogs: drainDialogs(),
  };
}

function keyEdge(action: string, key: string) {
  if (action !== "keydown" && action !== "keyup") {
    return { error: { code: "InvalidArgumentError", message: "key_edge requires keydown or keyup" } };
  }
  const target = (document.activeElement || document.body) as HTMLElement;
  const parsed = parseKeyChord(key);
  const normalized = parsed.key.length === 1 ? parsed.key : keyName(parsed.key);
  dispatchKey(target, normalized, action, parsed);
  return {
    text: action === "keydown" ? `Key down ${normalized}` : `Key up ${normalized}`,
    dialogs: drainDialogs(),
  };
}

function typeFocused(text: string, keyEvents: boolean) {
  const target = (document.activeElement || document.body) as HTMLElement;
  for (const char of text) {
    if (keyEvents) dispatchKey(target, char, "keydown");
    if (keyEvents) dispatchKey(target, char, "keypress");
    insertText(target, char);
    if (keyEvents) dispatchKey(target, char, "keyup");
  }
  return { text: keyEvents ? "Typed at current focus" : "Inserted text at current focus", dialogs: drainDialogs() };
}

function clipboardSelection() {
  const text = selectedTextFromEditable(document.activeElement) ?? selectedTextFromDocument();
  return {
    handled: true,
    focused: document.hasFocus(),
    text,
    length: text.length,
    dialogs: drainDialogs(),
  };
}

function clipboardPaste(text: string) {
  const target = document.activeElement;
  if (!target || !isEditableTextTarget(target)) {
    return {
      handled: true,
      focused: document.hasFocus(),
      pasted: false,
      reason: "No focused editable element",
      dialogs: drainDialogs(),
    };
  }
  insertText(target, text);
  return {
    handled: true,
    focused: document.hasFocus(),
    pasted: true,
    text: `Pasted ${text.length} character(s)`,
    length: text.length,
    dialogs: drainDialogs(),
  };
}

function stateExportStorage() {
  return {
    localStorage: storageSnapshot(localStorage),
    sessionStorage: storageSnapshot(sessionStorage),
    dialogs: drainDialogs(),
  };
}

function stateImportStorage(localValues: unknown, sessionValues: unknown) {
  const localMap = stringRecord(localValues);
  const sessionMap = stringRecord(sessionValues);
  localStorage.clear();
  for (const [key, value] of Object.entries(localMap)) {
    localStorage.setItem(key, value);
  }
  sessionStorage.clear();
  for (const [key, value] of Object.entries(sessionMap)) {
    sessionStorage.setItem(key, value);
  }
  return {
    text: "Imported active-origin storage",
    localStorageKeys: Object.keys(localMap).length,
    sessionStorageKeys: Object.keys(sessionMap).length,
    dialogs: drainDialogs(),
  };
}

function storageSnapshot(storage: Storage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key !== null) out[key] = storage.getItem(key) ?? "";
  }
  return out;
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, typeof item === "string" ? item : String(item ?? "")])
  );
}

function scrollPage(direction: string, pixels: number, selector?: unknown) {
  const scroller = selector ? document.querySelector(String(selector)) ?? findScrollContainer() : window;
  const isWindow = scroller === window;
  const element = scroller as HTMLElement;
  const horizontal = direction === "left" || direction === "right";
  const before = isWindow ? (horizontal ? window.scrollX : window.scrollY) : (horizontal ? element.scrollLeft : element.scrollTop);
  const delta = direction === "up" || direction === "left" ? -pixels : pixels;
  if (isWindow) {
    window.scrollBy({ top: horizontal ? 0 : delta, left: horizontal ? delta : 0, behavior: "instant" });
  } else {
    element.scrollBy({ top: horizontal ? 0 : delta, left: horizontal ? delta : 0, behavior: "instant" });
  }
  const after = isWindow ? (horizontal ? window.scrollX : window.scrollY) : (horizontal ? element.scrollLeft : element.scrollTop);
  return {
    text: `Scrolled ${direction} ${pixels}px (${Math.round(before)} -> ${Math.round(after)})`,
    before,
    after,
    dialogs: drainDialogs(),
  };
}

function mouseEvent(action: string, x: number, y: number, button: number, dx: number, dy: number) {
  if (Number.isFinite(x)) mouseX = Math.round(x);
  if (Number.isFinite(y)) mouseY = Math.round(y);
  mouseX = clamp(mouseX, 0, Math.max(0, window.innerWidth - 1));
  mouseY = clamp(mouseY, 0, Math.max(0, window.innerHeight - 1));
  const target = mouseTarget(mouseX, mouseY);
  if (action === "move") {
    dispatchPointerMouse(target, "pointermove", button);
    dispatchPointerMouse(target, "mousemove", button);
    return { text: `Moved mouse to ${mouseX},${mouseY}`, x: mouseX, y: mouseY, dialogs: drainDialogs() };
  }
  if (action === "down") {
    dispatchPointerMouse(target, "pointerdown", button);
    dispatchPointerMouse(target, "mousedown", button);
    return { text: `Mouse down at ${mouseX},${mouseY}`, x: mouseX, y: mouseY, button, dialogs: drainDialogs() };
  }
  if (action === "up") {
    dispatchPointerMouse(target, "pointerup", button);
    dispatchPointerMouse(target, "mouseup", button);
    return { text: `Mouse up at ${mouseX},${mouseY}`, x: mouseX, y: mouseY, button, dialogs: drainDialogs() };
  }
  if (action === "wheel") {
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: mouseX,
      clientY: mouseY,
      deltaX: Number.isFinite(dx) ? dx : 0,
      deltaY: Number.isFinite(dy) ? dy : 0,
    });
    const accepted = target.dispatchEvent(event);
    if (accepted) window.scrollBy({ left: Number.isFinite(dx) ? dx : 0, top: Number.isFinite(dy) ? dy : 0, behavior: "instant" });
    return { text: `Mouse wheel ${dy},${dx} at ${mouseX},${mouseY}`, x: mouseX, y: mouseY, dx, dy, dialogs: drainDialogs() };
  }
  return { error: { code: "invalid_args", message: "Unsupported mouse action" }, dialogs: drainDialogs() };
}

function dispatchPointerMouse(target: Element, type: string, button: number) {
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: mouseX,
    clientY: mouseY,
    button,
    buttons: type.endsWith("down") ? 1 << button : 0,
  };
  const EventConstructor = type.startsWith("pointer") && typeof PointerEvent !== "undefined" ? PointerEvent : MouseEvent;
  target.dispatchEvent(new EventConstructor(type, eventInit));
}

function mouseTarget(x: number, y: number): Element {
  return document.elementFromPoint(x, y) ?? document.body ?? document.documentElement;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function findScrollContainer(): HTMLElement | Window {
  const preferred = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[role="list"][aria-label^="Messages in"], [data-list-id="chat-messages"]'
    )
  ).find(isScrollable);
  if (preferred) return preferred;

  const visibleScrollable = Array.from(document.querySelectorAll<HTMLElement>("*"))
    .filter((element) => isVisible(element) && isScrollable(element))
    .sort((a, b) => b.clientHeight * b.clientWidth - a.clientHeight * a.clientWidth);
  return visibleScrollable[0] ?? window;
}

function isScrollable(element: HTMLElement): boolean {
  const style = getComputedStyle(element);
  return (
    element.scrollHeight > element.clientHeight + 8 &&
    ["auto", "scroll", "overlay"].includes(style.overflowY)
  );
}

function waitForSelector(selector: string, timeout: number, state = "visible"): Promise<Record<string, unknown>> {
  const satisfied = () => {
    const element = document.querySelector(selector);
    if (state === "hidden") return !element || !isVisible(element);
    return Boolean(element && isVisible(element));
  };
  if (satisfied()) {
    return Promise.resolve({ text: state === "hidden" ? `Selector hidden: ${selector}` : `Selector found: ${selector}`, dialogs: drainDialogs() });
  }
  return new Promise((resolve) => {
    let settled = false;
    let observer: MutationObserver | undefined;
    let timer: number | undefined;
    const settle = (result: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      observer?.disconnect();
      resolve(result);
    };
    observer = new MutationObserver(() => {
      if (satisfied()) {
        settle({ text: state === "hidden" ? `Selector hidden: ${selector}` : `Selector found: ${selector}`, dialogs: drainDialogs() });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    timer = window.setTimeout(() => {
      settle({
        error: { code: "timeout", message: `Timed out waiting for selector: ${selector}` },
        dialogs: drainDialogs(),
      });
    }, timeout);
  });
}

function waitForLocator(locator: Locator, timeout: number, state = "visible"): Promise<Record<string, unknown>> {
  const satisfied = () => {
    const matches = resolve(locator).filter(isVisible);
    if (state === "hidden") return matches.length === 0;
    return matches.length > 0;
  };
  if (satisfied()) {
    return Promise.resolve({ text: state === "hidden" ? "Locator hidden" : "Locator found", dialogs: drainDialogs() });
  }
  return new Promise((resolve) => {
    let settled = false;
    let observer: MutationObserver | undefined;
    let timer: number | undefined;
    const settle = (result: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      observer?.disconnect();
      resolve(result);
    };
    observer = new MutationObserver(() => {
      if (satisfied()) {
        settle({ text: state === "hidden" ? "Locator hidden" : "Locator found", dialogs: drainDialogs() });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    timer = window.setTimeout(() => {
      settle({
        error: { code: "timeout", message: "Timed out waiting for locator" },
        dialogs: drainDialogs(),
      });
    }, timeout);
  });
}

function waitForText(text: string, timeout: number, hidden: boolean): Promise<Record<string, unknown>> {
  const satisfied = () => clean(document.body?.innerText ?? "").includes(text) !== hidden;
  if (satisfied()) return Promise.resolve({ text: hidden ? `Text disappeared: ${text}` : `Text found: ${text}`, dialogs: drainDialogs() });
  return new Promise((resolve) => {
    let settled = false;
    let observer: MutationObserver | undefined;
    let timer: number | undefined;
    const settle = (result: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      observer?.disconnect();
      resolve(result);
    };
    observer = new MutationObserver(() => {
      if (satisfied()) {
        settle({ text: hidden ? `Text disappeared: ${text}` : `Text found: ${text}`, dialogs: drainDialogs() });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });
    timer = window.setTimeout(() => {
      settle({ error: { code: "timeout", message: `Timed out waiting for text: ${text}` }, dialogs: drainDialogs() });
    }, timeout);
  });
}

function waitForFunction(expression: string, timeout: number): Promise<Record<string, unknown>> {
  const first = evaluatePageExpression(expression);
  if (first.ok && first.truthy) {
    return Promise.resolve({ text: "Function condition satisfied", value: first.value, dialogs: drainDialogs() });
  }
  return new Promise((resolve) => {
    let settled = false;
    const started = Date.now();
    let lastError = first.ok ? "" : first.message;
    let timer: number | undefined;
    const settle = (result: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearInterval(timer);
      resolve(result);
    };
    timer = window.setInterval(() => {
      const result = evaluatePageExpression(expression);
      if (result.ok && result.truthy) {
        settle({ text: "Function condition satisfied", value: result.value, dialogs: drainDialogs() });
        return;
      }
      if (!result.ok) lastError = result.message;
      if (Date.now() - started > timeout) {
        const suffix = lastError ? ` (last error: ${lastError})` : "";
        settle({ error: { code: "timeout", message: `Timed out waiting for function condition${suffix}` }, dialogs: drainDialogs() });
      }
    }, 100);
  });
}

function resolveOne(locator: Locator): { element: Element } | { error: Record<string, string>; dialogs: DialogRecord[] } {
  const matches = resolve(locator);
  if (matches.length === 0) {
    return {
      error: { code: "ref_stale", message: "No unique element matches this locator" },
      dialogs: drainDialogs(),
    };
  }
  if (matches.length > 1) {
    return {
      error: { code: "ambiguous_locator", message: `${matches.length} elements match this locator` },
      dialogs: drainDialogs(),
    };
  }
  return { element: matches[0] };
}

function resolve(locator: Locator): Element[] {
  if (locator.kind === "handle") {
    const element = elementsByHandle.get(locator.handle);
    if (element?.isConnected && isVisible(element)) return [element];
    return resolve(locator.fallback);
  }
  if (locator.kind === "css") {
    return indexed(Array.from(document.querySelectorAll(locator.selector)).filter(isVisible), locator.index);
  }
  if (locator.kind === "xpath") {
    return indexed(resolveXPath(locator.expression).filter(isVisible), locator.index);
  }
  const all = candidateElements().filter((el) => toSnapshot(el).visible);
  const matches = all.filter((element) => matchesLocator(element, locator));
  return indexed(matches, locator.index ?? 0);
}

function matchesLocator(element: Element, locator: Locator): boolean {
  const role = inferRole(element);
  const name = accessibleName(element);
  const text = clean(element.textContent ?? "");
  const label = labelText(element);
  const placeholder = attr(element, "placeholder");
  const testid = attr(element, "data-testid") || attr(element, "data-test");
  const alt = attr(element, "alt");
  const title = attr(element, "title");
  const textMatches = (haystack: string, needle: string, exact?: boolean) => {
    const normalizedHaystack = clean(haystack).toLowerCase();
    const normalizedNeedle = clean(needle).toLowerCase();
    return exact ? normalizedHaystack === normalizedNeedle : normalizedHaystack.includes(normalizedNeedle);
  };

  switch (locator.kind) {
    case "role":
      return role === locator.role && (!locator.name || textMatches(name, locator.name, locator.exact));
    case "label":
      return textMatches(label || name, locator.text, locator.exact);
    case "text":
      return textMatches(text || name, locator.text, locator.exact);
    case "placeholder":
      return textMatches(placeholder, locator.text, locator.exact);
    case "testid":
      return testid === locator.value;
    case "alt":
      return textMatches(alt, locator.text, locator.exact);
    case "title":
      return textMatches(title, locator.text, locator.exact);
    case "css":
      return safeMatches(element, locator.selector);
    case "xpath":
      return resolveXPath(locator.expression).includes(element);
    case "handle":
      return elementsByHandle.get(locator.handle) === element || matchesLocator(element, locator.fallback);
  }
}

function candidateElements(root: ParentNode = document): Element[] {
  const selector = [
    "a[href]",
    "button",
    "input",
    "textarea",
    "select",
    "summary",
    "[role]",
    "[contenteditable='true']",
    "[tabindex]:not([tabindex='-1'])",
    "[data-testid]",
    "[data-test]",
    "[aria-label]",
    "img[alt]",
    "iframe",
    "frame",
    "[title]",
  ].join(",");
  const roots: ParentNode[] = [root];
  const out: Element[] = [];
  for (const root of roots) {
    if (root instanceof Element && safeMatches(root, selector)) out.push(root);
    out.push(...Array.from(root.querySelectorAll(selector)));
    for (const element of Array.from(root.querySelectorAll("*"))) {
      const shadow = (element as HTMLElement).shadowRoot;
      if (shadow) out.push(...Array.from(shadow.querySelectorAll(selector)));
    }
  }
  return unique(out);
}

function toSnapshot(element: Element, root: ParentNode = document): ElementSnapshot {
  const rect = element.getBoundingClientRect();
  const role = inferRole(element);
  const name = accessibleName(element);
  const text = clean(element.textContent ?? "");
  const label = labelText(element);
  const placeholder = attr(element, "placeholder");
  const testid = attr(element, "data-testid") || attr(element, "data-test");
  const href = hrefFor(element);
  return {
    role,
    name,
    text,
    label,
    placeholder,
    testid,
    href,
    frameUrl: isFrameElement(element) ? currentFrameUrlFor(element) : undefined,
    depth: elementDepthWithinRoot(element, root),
    disabled: isDisabled(element),
    visible: isVisible(element),
    bounds: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    locator: locatorFor(element, role, name, label, text, placeholder, testid),
  };
}

function hrefFor(element: Element) {
  if (isFrameElement(element)) return frameSourceFor(element);
  if (element instanceof HTMLAnchorElement || element instanceof HTMLAreaElement) {
    return element.href || attr(element, "href") || undefined;
  }
  return attr(element, "href") || undefined;
}

function linkHrefFor(element: Element) {
  const link = element instanceof HTMLAnchorElement ? element : element.closest?.("a[href]");
  if (link instanceof HTMLAnchorElement) return link.href || attr(link, "href") || undefined;
  return hrefFor(element);
}

function isFrameElement(element: Element) {
  const tag = element.tagName.toLowerCase();
  return tag === "iframe" || tag === "frame";
}

function frameSourceFor(element: Element) {
  if (element instanceof HTMLIFrameElement) return element.src || attr(element, "src") || undefined;
  return attr(element, "src") || undefined;
}

function currentFrameUrlFor(element: Element) {
  try {
    if (element instanceof HTMLIFrameElement) return element.contentWindow?.location.href || frameSourceFor(element);
  } catch {
    // Cross-origin frames can hide contentWindow.location; the static src is still useful for matching when available.
  }
  return frameSourceFor(element);
}

function locatorFor(
  element: Element,
  role: string,
  name: string,
  label: string,
  text: string,
  placeholder: string,
  testid: string
): Locator {
  const fallback = fallbackLocatorFor(element, role, name, label, text, placeholder, testid);
  const handle = handleFor(element);
  return { kind: "handle", handle, fallback };
}

function fallbackLocatorFor(
  element: Element,
  role: string,
  name: string,
  label: string,
  text: string,
  placeholder: string,
  testid: string
): NonHandleLocator {
  const id = attr(element, "id");
  if (id) {
    const selector = `#${cssEscape(id)}`;
    return { kind: "css", selector, index: indexFor({ kind: "css", selector, index: 0 }, element) };
  }
  if (testid) return { kind: "testid", value: testid, index: indexFor({ kind: "testid", value: testid, index: 0 }, element) };
  if (role && name) return { kind: "role", role, name, index: indexFor({ kind: "role", role, name, index: 0 }, element) };
  if (label) return { kind: "label", text: label, index: indexFor({ kind: "label", text: label, index: 0 }, element) };
  if (placeholder) return { kind: "placeholder", text: placeholder, index: indexFor({ kind: "placeholder", text: placeholder, index: 0 }, element) };
  if (attr(element, "alt")) return { kind: "alt", text: attr(element, "alt"), index: indexFor({ kind: "alt", text: attr(element, "alt"), index: 0 }, element) };
  if (attr(element, "title")) return { kind: "title", text: attr(element, "title"), index: indexFor({ kind: "title", text: attr(element, "title"), index: 0 }, element) };
  if (role) return { kind: "role", role, index: indexFor({ kind: "role", role, index: 0 }, element) };
  return { kind: "text", text: text || name, index: indexFor({ kind: "text", text: text || name, index: 0 }, element) };
}

function indexFor(locator: Locator, target?: Element): number {
  if (!target) return 0;
  const matches = candidateElements().filter((element) => matchesLocator(element, locator));
  return Math.max(0, matches.indexOf(target));
}

function inferRole(element: Element): string {
  const explicit = attr(element, "role");
  if (explicit) return explicit.split(/\s+/)[0];
  const tag = element.tagName.toLowerCase();
  if (tag === "a" && attr(element, "href")) return "link";
  if (tag === "button") return "button";
  if (tag === "iframe" || tag === "frame") return "iframe";
  if (tag === "textarea") return "textbox";
  if (tag === "select") return "combobox";
  if (tag === "label") return "label";
  if (tag === "summary") return "button";
  if (tag === "input") {
    const type = attr(element, "type").toLowerCase();
    if (["button", "submit", "reset"].includes(type)) return "button";
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "range") return "slider";
    return "textbox";
  }
  if ((element as HTMLElement).isContentEditable) return "textbox";
  return "generic";
}

function accessibleName(element: Element): string {
  const aria = attr(element, "aria-label");
  if (aria) return aria;
  const labelledBy = attr(element, "aria-labelledby");
  if (labelledBy) {
    const value = labelledBy
      .split(/\s+/)
      .map((id) => clean(document.getElementById(id)?.textContent ?? ""))
      .filter(Boolean)
      .join(" ");
    if (value) return value;
  }
  const label = labelText(element);
  if (label) return label;
  if (element instanceof HTMLInputElement && ["button", "submit", "reset"].includes(element.type)) {
    return element.value || attr(element, "title");
  }
  return clean(attr(element, "alt") || attr(element, "title") || attr(element, "placeholder") || element.textContent || "");
}

function labelText(element: Element): string {
  if (!(element instanceof HTMLElement)) return "";
  if (element.id) {
    const label = document.querySelector(`label[for="${cssEscape(element.id)}"]`);
    if (label) return clean(label.textContent ?? "");
  }
  const wrapping = element.closest("label");
  return clean(wrapping?.textContent ?? "");
}

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
}

function isDisabled(element: Element): boolean {
  return Boolean((element as HTMLButtonElement).disabled || attr(element, "aria-disabled") === "true");
}

function attr(element: Element, name: string): string {
  return (element.getAttribute(name) ?? "").trim();
}

function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function drainDialogs(): DialogRecord[] {
  return dialogs.splice(0, dialogs.length);
}

function pushCapped<T>(items: T[], item: T, max: number) {
  items.push(item);
  if (items.length > max) items.splice(0, items.length - max);
}

function dialogStatus() {
  const drained = drainDialogs();
  const dialog = drained[drained.length - 1] ?? null;
  return {
    text: dialog ? `${dialog.type}: ${dialog.message}` : "No dialog recorded",
    active: Boolean(dialog),
    dialog,
    dialogs: drained,
  };
}

function configureNextDialog(action: unknown, text: unknown) {
  const normalizedAction = action === "accept" ? "accept" : "dismiss";
  const promptText = typeof text === "string" ? text : undefined;
  window.postMessage(
    {
      source: "pire-browser",
      kind: "dialog_control",
      action: normalizedAction,
      text: promptText,
    },
    "*"
  );
  return {
    text:
      normalizedAction === "accept"
        ? `Next shimmed dialog will be accepted${promptText !== undefined ? ` with ${promptText}` : ""}`
        : "Next shimmed dialog will be dismissed",
    action: normalizedAction,
    promptText,
    dialogs: drainDialogs(),
  };
}

function debugLogs(kind: string, clear: boolean) {
  if (kind === "errors") {
    const errors = pageErrorRecords.slice();
    if (clear) pageErrorRecords.length = 0;
    return {
      text: clear ? `Cleared ${errors.length} page error(s)` : formatPageErrors(errors),
      errors,
      count: errors.length,
      cleared: clear,
      dialogs: drainDialogs(),
    };
  }

  const messages = consoleRecords.slice();
  if (clear) consoleRecords.length = 0;
  return {
    text: clear ? `Cleared ${messages.length} console message(s)` : formatConsoleRecords(messages),
    messages,
    count: messages.length,
    cleared: clear,
    dialogs: drainDialogs(),
  };
}

function formatConsoleRecords(records: ConsoleRecord[]) {
  if (!records.length) return "No console messages recorded";
  return records.map((record) => `[${record.level}] ${record.text}`).join("\n");
}

function formatPageErrors(records: PageErrorRecord[]) {
  if (!records.length) return "No page errors recorded";
  return records
    .map((record) => {
      const location = record.source
        ? ` (${record.source}${record.lineno ? `:${record.lineno}` : ""}${record.colno ? `:${record.colno}` : ""})`
        : "";
      return `[${record.type}] ${record.message}${location}`;
    })
    .join("\n");
}

function pageVitals() {
  const metrics = {
    ttfb: timingMetric("TTFB", navigationTimingValue("responseStart"), "ms", "PerformanceNavigationTiming", [800, 1800]),
    fcp: timingMetric("FCP", paintTimingValue("first-contentful-paint"), "ms", "PerformancePaintTiming", [1800, 3000]),
    lcp: timingMetric("LCP", largestContentfulPaintValue(), "ms", "LargestContentfulPaint", [2500, 4000]),
    cls: timingMetric("CLS", cumulativeLayoutShiftValue(), "score", "LayoutShift", [0.1, 0.25]),
    inp: timingMetric("INP", interactionToNextPaintValue(), "ms", "PerformanceEventTiming", [200, 500]),
  };
  const navigation = navigationSummary();
  const hydration = hydrationSummary();
  return {
    text: formatVitalsText(metrics, navigation, hydration),
    url: location.href,
    title: document.title,
    metrics,
    navigation,
    hydration,
    warnings: [
      {
        code: "BEST_EFFORT_FIREFOX_GAP",
        feature: "vitals",
        message:
          "Web Vitals are collected from browser Performance APIs exposed to Firefox content scripts; some Chrome web-vitals signals may be unavailable.",
      },
    ],
    dialogs: drainDialogs(),
  };
}

function timingMetric(
  name: string,
  value: number | null,
  unit: "ms" | "score",
  source: string,
  thresholds: [number, number]
): VitalsMetric {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return { name, value: null, unit, rating: "unknown", available: false, source };
  }
  return {
    name,
    value,
    unit,
    rating: rateMetric(value, thresholds),
    available: true,
    source,
  };
}

function rateMetric(value: number, [good, needsImprovement]: [number, number]): VitalsMetric["rating"] {
  if (value <= good) return "good";
  if (value <= needsImprovement) return "needs-improvement";
  return "poor";
}

function navigationTimingValue(field: string): number | null {
  const nav = navigationEntry();
  const value = nav && typeof nav[field] === "number" ? nav[field] : null;
  if (typeof value === "number" && value > 0) return value;
  const legacy = legacyNavigationTimingValue(field);
  return legacy;
}

function legacyNavigationTimingValue(field: string): number | null {
  const timing = performance.timing as any;
  if (!timing || typeof timing.navigationStart !== "number") return null;
  const value = timing[field];
  if (typeof value !== "number" || value <= 0) return null;
  return value - timing.navigationStart;
}

function paintTimingValue(name: string): number | null {
  const entry = performance.getEntriesByName(name)[0] as PerformanceEntry | undefined;
  return typeof entry?.startTime === "number" ? entry.startTime : null;
}

function largestContentfulPaintValue(): number | null {
  const entries = performance.getEntriesByType("largest-contentful-paint") as any[];
  const entry = entries[entries.length - 1];
  return typeof entry?.startTime === "number" ? entry.startTime : null;
}

function cumulativeLayoutShiftValue(): number | null {
  const entries = performance.getEntriesByType("layout-shift") as any[];
  if (!entries.length) return null;
  return entries
    .filter((entry) => !entry.hadRecentInput)
    .reduce((sum, entry) => sum + (typeof entry.value === "number" ? entry.value : 0), 0);
}

function interactionToNextPaintValue(): number | null {
  const entries = performance.getEntriesByType("event") as any[];
  const interactionEntries = entries.filter((entry) => Number(entry.interactionId) > 0 && typeof entry.duration === "number");
  if (!interactionEntries.length) return null;
  return Math.max(...interactionEntries.map((entry) => entry.duration));
}

function navigationSummary() {
  return {
    domContentLoaded: timingMetric(
      "DOMContentLoaded",
      navigationTimingValue("domContentLoadedEventEnd"),
      "ms",
      "PerformanceNavigationTiming",
      [2000, 4000]
    ),
    load: timingMetric("Load", navigationTimingValue("loadEventEnd"), "ms", "PerformanceNavigationTiming", [2500, 5000]),
    readyState: document.readyState,
  };
}

function navigationEntry(): any | null {
  return (performance.getEntriesByType("navigation")[0] as any) ?? null;
}

function hydrationSummary() {
  const hydrationRecords = [...consoleRecords, ...pageErrorRecords].filter((record) => /hydrat/i.test(logRecordMessage(record)));
  const frameworks = {
    next: Boolean(document.getElementById("__NEXT_DATA__") || document.querySelector("[data-nextjs-router]")),
    react:
      Boolean((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) ||
      Boolean(document.querySelector("#root, #__next, [data-reactroot], [data-reactid]")),
  };
  return {
    warnings: hydrationRecords.map((record) => ({
      type: "level" in record ? record.level : record.type,
      message: "text" in record ? record.text : record.message,
      at: record.at,
    })),
    warningCount: hydrationRecords.length,
    frameworks,
  };
}

function logRecordMessage(record: ConsoleRecord | PageErrorRecord) {
  return "text" in record ? record.text : record.message;
}

function formatVitalsText(metrics: Record<string, VitalsMetric>, navigation: ReturnType<typeof navigationSummary>, hydration: ReturnType<typeof hydrationSummary>) {
  const lines = [`Web Vitals for ${location.href}`];
  for (const key of ["ttfb", "fcp", "lcp", "cls", "inp"]) {
    lines.push(formatVitalMetric(metrics[key]));
  }
  lines.push(formatVitalMetric(navigation.domContentLoaded));
  lines.push(formatVitalMetric(navigation.load));
  lines.push(`Ready state: ${navigation.readyState}`);
  lines.push(`Hydration warnings: ${hydration.warningCount}`);
  return lines.join("\n");
}

function formatVitalMetric(metric: VitalsMetric) {
  if (!metric.available || metric.value === null) return `${metric.name}: unavailable`;
  const value = metric.unit === "ms" ? `${Math.round(metric.value)}ms` : metric.value.toFixed(3);
  return `${metric.name}: ${value} (${metric.rating})`;
}

function fireInputEvents(element: Element) {
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
  descriptor?.set?.call(element, value);
}

function keyName(key: string): string {
  const map: Record<string, string> = {
    enter: "Enter",
    tab: "Tab",
    escape: "Escape",
    esc: "Escape",
    backspace: "Backspace",
    arrowleft: "ArrowLeft",
    arrowright: "ArrowRight",
    arrowup: "ArrowUp",
    arrowdown: "ArrowDown",
  };
  return map[key.toLowerCase()] ?? key;
}

function isTextLike(element: Element): boolean {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || (element as HTMLElement).isContentEditable;
}

function isEditableTextTarget(element: Element): boolean {
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  if (element instanceof HTMLInputElement) {
    const nonTextTypes = new Set(["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"]);
    return !element.disabled && !element.readOnly && !nonTextTypes.has(element.type);
  }
  return (element as HTMLElement).isContentEditable;
}

function selectedTextFromEditable(element: Element | null): string | null {
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return null;
  try {
    const start = element.selectionStart;
    const end = element.selectionEnd;
    if (typeof start !== "number" || typeof end !== "number" || start === end) return "";
    return element.value.slice(start, end);
  } catch {
    return null;
  }
}

function selectedTextFromDocument(): string {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return "";
  return selection.toString();
}

function insertText(element: Element, text: string) {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const start = element.selectionStart ?? element.value.length;
    const end = element.selectionEnd ?? element.value.length;
    setNativeValue(element, element.value.slice(0, start) + text + element.value.slice(end));
    element.setSelectionRange(start + text.length, start + text.length);
    fireInputEvents(element);
  } else if ((element as HTMLElement).isContentEditable) {
    document.execCommand("insertText", false, text);
  }
}

function submitFormForEnter(element: HTMLInputElement, keyAccepted: boolean) {
  if (!keyAccepted || !element.form || ["button", "checkbox", "file", "hidden", "radio", "reset", "submit"].includes(element.type)) {
    return;
  }
  if (typeof element.form.requestSubmit === "function") {
    element.form.requestSubmit();
  } else {
    element.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  }
}

function handleFor(element: Element): string {
  const existing = handlesByElement.get(element);
  if (existing) return existing;
  const handle = `h${nextHandleNumber++}`;
  handlesByElement.set(element, handle);
  elementsByHandle.set(handle, element);
  return handle;
}

function indexed(elements: Element[], index: number): Element[] {
  if (index < 0) return elements;
  const selected = index === Number.MAX_SAFE_INTEGER ? elements[elements.length - 1] : elements[Math.max(0, index ?? 0)];
  return selected ? [selected] : [];
}

function resolveXPath(expression: string): Element[] {
  const out: Element[] = [];
  try {
    const result = document.evaluate(expression, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
    let node = result.iterateNext();
    while (node) {
      if (node instanceof Element) out.push(node);
      node = result.iterateNext();
    }
  } catch {
    return [];
  }
  return out;
}

function safeMatches(element: Element, selector: string): boolean {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

function elementValue(element: Element): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return element.value;
  }
  return clean(element.textContent ?? "");
}

function computedStyles(element: Element): Record<string, string> {
  const style = getComputedStyle(element);
  return {
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    color: style.color,
    backgroundColor: style.backgroundColor,
    position: style.position,
  };
}

function rectObject(rect: DOMRect) {
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

function dispatchKey(target: HTMLElement, key: string, type: string, chord: Partial<ReturnType<typeof parseKeyChord>> = {}) {
  return target.dispatchEvent(
    new KeyboardEvent(type, {
      key,
      code: key.length === 1 ? `Key${key.toUpperCase()}` : key,
      bubbles: true,
      cancelable: true,
      ctrlKey: Boolean(chord.ctrlKey),
      altKey: Boolean(chord.altKey),
      shiftKey: Boolean(chord.shiftKey),
      metaKey: Boolean(chord.metaKey),
    })
  );
}

function parseKeyChord(value: string) {
  const parts = value.split("+").filter(Boolean);
  const key = parts.pop() ?? value;
  const modifiers = new Set(parts.map((part) => part.toLowerCase()));
  return {
    key,
    ctrlKey: modifiers.has("control") || modifiers.has("ctrl"),
    altKey: modifiers.has("alt"),
    shiftKey: modifiers.has("shift"),
    metaKey: modifiers.has("meta") || modifiers.has("cmd") || modifiers.has("command"),
  };
}

function evalScript(script: string) {
  const result = evaluatePageExpression(script);
  if (result.ok) {
    return {
      text: result.text,
      value: result.value,
      dialogs: drainDialogs(),
    };
  }
  return {
    error: {
      code: "EvaluationFailed",
      message: result.message,
    },
    dialogs: drainDialogs(),
  };
}

async function pushStateNavigation(input: string) {
  const previousUrl = location.href;
  let target: URL;
  try {
    target = new URL(input, location.href);
  } catch {
    return { error: { code: "invalid_args", message: `Invalid pushstate URL: ${input}` }, dialogs: drainDialogs() };
  }
  if (target.origin !== location.origin) {
    return {
      error: {
        code: "invalid_args",
        message: `pushstate requires same-origin URL; current origin is ${location.origin}`,
      },
      dialogs: drainDialogs(),
    };
  }

  const pageWindow = ((window as unknown as { wrappedJSObject?: unknown }).wrappedJSObject ?? window) as any;
  const nextRouter = pageWindow.next?.router;
  const route = `${target.pathname}${target.search}${target.hash}`;
  if (nextRouter && typeof nextRouter.push === "function") {
    try {
      await Promise.race([Promise.resolve(nextRouter.push(route)), delay(5000)]);
      await delay(50);
      return {
        text: `Pushed SPA route ${location.href}`,
        previousUrl,
        url: location.href,
        requestedUrl: target.href,
        method: "next.router.push",
        dialogs: drainDialogs(),
      };
    } catch {
      // Fall back to history.pushState below. Some frameworks expose a router
      // object before it is ready for imperative navigation.
    }
  }

  history.pushState(null, "", target.href);
  dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
  if (hashWithoutUrl(previousUrl) !== target.hash) {
    dispatchEvent(new HashChangeEvent("hashchange", { oldURL: previousUrl, newURL: target.href }));
  }
  dispatchEvent(new Event("locationchange"));
  return {
    text: `Pushed SPA route ${location.href}`,
    previousUrl,
    url: location.href,
    requestedUrl: target.href,
    method: "history.pushState",
    dialogs: drainDialogs(),
  };
}

function evaluatePageExpression(expression: string): PageEvaluation {
  const pageWindow = ((window as unknown as { wrappedJSObject?: unknown }).wrappedJSObject ?? window) as any;
  const pageFunction = typeof pageWindow.Function === "function" ? pageWindow.Function : Function;
  try {
    const value = pageFunction(`return (${expression});`).call(pageWindow);
    return successfulPageEvaluation(value);
  } catch (error) {
    if (!isSyntaxError(error)) return failedPageEvaluation(error);
    try {
      const pageEval = typeof pageWindow.eval === "function" ? pageWindow.eval : eval;
      const value = pageEval.call(pageWindow, expression);
      return successfulPageEvaluation(value);
    } catch (fallbackError) {
      return failedPageEvaluation(fallbackError);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hashWithoutUrl(url: string) {
  try {
    return new URL(url).hash;
  } catch {
    return "";
  }
}

function successfulPageEvaluation(value: any): PageEvaluation {
  const serialized = serializePageValue(value);
  return {
    ok: true,
    value: serialized,
    text: valueToText(serialized),
    truthy: Boolean(value),
  };
}

function failedPageEvaluation(error: unknown): PageEvaluation {
  return {
    ok: false,
    message: errorMessage(error),
  };
}

function isSyntaxError(error: unknown) {
  if (error instanceof SyntaxError) return true;
  return Boolean(error && typeof error === "object" && "name" in error && String((error as { name?: unknown }).name) === "SyntaxError");
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error) return String((error as { message?: unknown }).message);
  return String(error);
}

function serializePageValue(value: any): unknown {
  if (value === undefined) return null;
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "bigint") return value.toString();
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return JSON.parse(json);
  } catch {
    // Fall through to a string representation for non-cloneable page objects.
  }
  try {
    return String(value);
  } catch {
    return "[unserializable]";
  }
}

function valueToText(value: unknown) {
  if (typeof value === "string") return value;
  const json = JSON.stringify(value);
  return json === undefined ? String(value) : json;
}

function viewportMetrics() {
  const root = document.documentElement;
  return {
    text: `${window.innerWidth}x${window.innerHeight}`,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    clientWidth: root?.clientWidth ?? null,
    clientHeight: root?.clientHeight ?? null,
    visualViewport: window.visualViewport
      ? {
          width: Math.round(window.visualViewport.width),
          height: Math.round(window.visualViewport.height),
          scale: window.visualViewport.scale,
        }
      : null,
    dialogs: drainDialogs(),
  };
}

function bestEffortWarning(feature: string, message: string) {
  return { code: "BEST_EFFORT_FIREFOX_GAP", feature, message };
}

function describeElement(element: Element): string {
  const snap = toSnapshot(element);
  return `${snap.role}${snap.name ? ` "${snap.name}"` : ""}`;
}

function cssEscape(value: string): string {
  if ("CSS" in window && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
}
