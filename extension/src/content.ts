{
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

const dialogs: DialogRecord[] = [];
let nextHandleNumber = 1;
const handlesByElement = new WeakMap<Element, string>();
const elementsByHandle = new Map<string, Element>();

injectDialogShim();

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  const data = event.data;
  if (!data || data.source !== "pire-browser" || data.kind !== "dialog") return;
  dialogs.push(data.payload as DialogRecord);
});

browser.runtime.onMessage.addListener((message: any) => {
  if (!message || typeof message.type !== "string") return undefined;
  if (message.type === "snapshot") return Promise.resolve(snapshotFrame());
  if (message.type === "find") return Promise.resolve(findElements(message.locator));
  if (message.type === "click") return Promise.resolve(clickLocator(message.locator));
  if (message.type === "dblclick") return Promise.resolve(doubleClickLocator(message.locator));
  if (message.type === "fill") return Promise.resolve(fillLocator(message.locator, message.text ?? ""));
  if (message.type === "type") return Promise.resolve(typeLocator(message.locator, message.text ?? ""));
  if (message.type === "focus") return Promise.resolve(focusLocator(message.locator));
  if (message.type === "hover") return Promise.resolve(hoverLocator(message.locator));
  if (message.type === "select") return Promise.resolve(selectLocator(message.locator, message.value ?? ""));
  if (message.type === "check") return Promise.resolve(checkLocator(message.locator, true));
  if (message.type === "uncheck") return Promise.resolve(checkLocator(message.locator, false));
  if (message.type === "scrollintoview") return Promise.resolve(scrollIntoViewLocator(message.locator));
  if (message.type === "get") return Promise.resolve(getLocator(message.locator, String(message.property ?? "text"), message.attribute));
  if (message.type === "is") return Promise.resolve(isLocator(message.locator, String(message.state ?? "visible")));
  if (message.type === "press") return Promise.resolve(pressKey(String(message.key ?? "")));
  if (message.type === "keyboard_type") return Promise.resolve(typeFocused(String(message.text ?? ""), true));
  if (message.type === "keyboard_inserttext") return Promise.resolve(typeFocused(String(message.text ?? ""), false));
  if (message.type === "scroll") {
    return Promise.resolve(scrollPage(String(message.direction ?? "down"), Number(message.pixels ?? 900), message.selector));
  }
  if (message.type === "wait_selector") {
    return waitForSelector(String(message.selector), Number(message.timeout ?? 10_000), String(message.state ?? "visible"));
  }
  if (message.type === "wait_text") return waitForText(String(message.text ?? ""), Number(message.timeout ?? 10_000), Boolean(message.hidden));
  if (message.type === "wait_fn") return waitForFunction(String(message.expression ?? ""), Number(message.timeout ?? 10_000));
  if (message.type === "eval") return Promise.resolve(evalScript(String(message.script ?? "")));
  return undefined;
});

function injectDialogShim() {
  try {
    const script = document.createElement("script");
    script.src = browser.runtime.getURL("dist/dialog-shim.js");
    script.async = false;
    (document.documentElement || document.head).appendChild(script);
    script.remove();
  } catch {
    // Restricted pages can reject script injection; commands will continue without dialog capture.
  }
}

function snapshotFrame(): FrameSnapshot {
  const elements = candidateElements().map(toSnapshot).filter((item) => item.visible);
  const drained = drainDialogs();
  return {
    frameId: 0,
    url: location.href,
    title: document.title,
    elements,
    dialogs: drained,
  };
}

function findElements(locator: Locator) {
  const matches = resolve(locator).map(toSnapshot);
  return {
    matches,
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
  element.focus({ preventScroll: true });
  element.click();
  return {
    text: `Clicked ${describeElement(element)}`,
    dialogs: drainDialogs(),
  };
}

function doubleClickLocator(locator: Locator) {
  const resolved = resolveOne(locator);
  if ("error" in resolved) return resolved;
  const element = resolved.element as HTMLElement;
  element.scrollIntoView({ block: "center", inline: "center" });
  element.focus({ preventScroll: true });
  for (const detail of [1, 2]) {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail }));
  }
  element.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }));
  return {
    text: `Double-clicked ${describeElement(element)}`,
    dialogs: drainDialogs(),
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

function scrollPage(direction: string, pixels: number, selector?: unknown) {
  const scroller = selector ? document.querySelector(String(selector)) ?? findScrollContainer() : findScrollContainer();
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
  const warnings = [bestEffortWarning("wait --fn", "Firefox WebExtensions evaluate wait --fn in the content-script isolated world, so page globals and framework state may not be visible.")];
  const evaluate = () => Boolean(Function(`return (${expression});`).call(window));
  try {
    if (evaluate()) return Promise.resolve({ text: "Function condition satisfied", warnings, dialogs: drainDialogs() });
  } catch {
    // Keep polling; many conditions reference objects that appear later.
  }
  return new Promise((resolve) => {
    let settled = false;
    const started = Date.now();
    let timer: number | undefined;
    const settle = (result: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) window.clearInterval(timer);
      resolve(result);
    };
    timer = window.setInterval(() => {
      try {
        if (evaluate()) {
          settle({ text: "Function condition satisfied", warnings, dialogs: drainDialogs() });
        } else if (Date.now() - started > timeout) {
          settle({ error: { code: "timeout", message: "Timed out waiting for function condition" }, warnings, dialogs: drainDialogs() });
        }
      } catch {
        if (Date.now() - started > timeout) {
          settle({ error: { code: "timeout", message: "Timed out waiting for function condition" }, warnings, dialogs: drainDialogs() });
        }
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
  const includes = (haystack: string, needle: string) =>
    haystack.toLowerCase().includes(needle.toLowerCase());

  switch (locator.kind) {
    case "role":
      return role === locator.role && (!locator.name || includes(name, locator.name));
    case "label":
      return includes(label || name, locator.text);
    case "text":
      return includes(text || name, locator.text);
    case "placeholder":
      return includes(placeholder, locator.text);
    case "testid":
      return testid === locator.value;
    case "alt":
      return includes(alt, locator.text);
    case "title":
      return includes(title, locator.text);
    case "css":
      return safeMatches(element, locator.selector);
    case "xpath":
      return resolveXPath(locator.expression).includes(element);
    case "handle":
      return elementsByHandle.get(locator.handle) === element || matchesLocator(element, locator.fallback);
  }
}

function candidateElements(): Element[] {
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
    "[title]",
  ].join(",");
  const roots: ParentNode[] = [document];
  const out: Element[] = [];
  for (const root of roots) {
    out.push(...Array.from(root.querySelectorAll(selector)));
    for (const element of Array.from(root.querySelectorAll("*"))) {
      const shadow = (element as HTMLElement).shadowRoot;
      if (shadow) out.push(...Array.from(shadow.querySelectorAll(selector)));
    }
  }
  return unique(out);
}

function toSnapshot(element: Element): ElementSnapshot {
  const rect = element.getBoundingClientRect();
  const role = inferRole(element);
  const name = accessibleName(element);
  const text = clean(element.textContent ?? "");
  const label = labelText(element);
  const placeholder = attr(element, "placeholder");
  const testid = attr(element, "data-testid") || attr(element, "data-test");
  return {
    role,
    name,
    text,
    label,
    placeholder,
    testid,
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
  try {
    const value = Function(`return (${script});`).call(window);
    return {
      text: typeof value === "string" ? value : JSON.stringify(value),
      value,
      warnings: [bestEffortWarning("eval", "Firefox WebExtensions evaluate in the content-script world, not a CDP page world.")],
      dialogs: drainDialogs(),
    };
  } catch (error) {
    return {
      error: {
        code: "EvaluationFailed",
        message: error instanceof Error ? error.message : String(error),
      },
      dialogs: drainDialogs(),
    };
  }
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
