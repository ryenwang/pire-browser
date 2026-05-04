{
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

const dialogs: DialogRecord[] = [];

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
  if (message.type === "fill") return Promise.resolve(fillLocator(message.locator, message.text ?? ""));
  if (message.type === "press") return Promise.resolve(pressKey(String(message.key ?? "")));
  if (message.type === "scroll") {
    return Promise.resolve(scrollPage(String(message.direction ?? "down"), Number(message.pixels ?? 900)));
  }
  if (message.type === "wait_selector") {
    return waitForSelector(String(message.selector), Number(message.timeout ?? 10_000));
  }
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
  element.scrollIntoView({ block: "center", inline: "center" });
  element.focus({ preventScroll: true });
  element.click();
  return {
    text: `Clicked ${describeElement(element)}`,
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

function pressKey(key: string) {
  const target = (document.activeElement || document.body) as HTMLElement;
  const normalized = key.length === 1 ? key : keyName(key);
  for (const type of ["keydown", "keyup"]) {
    target.dispatchEvent(
      new KeyboardEvent(type, {
        key: normalized,
        code: normalized.length === 1 ? `Key${normalized.toUpperCase()}` : normalized,
        bubbles: true,
        cancelable: true,
      })
    );
  }
  if (normalized.length === 1 && isTextLike(target)) {
    insertText(target, normalized);
  }
  return {
    text: `Pressed ${normalized}`,
    dialogs: drainDialogs(),
  };
}

function scrollPage(direction: string, pixels: number) {
  const scroller = findScrollContainer();
  const isWindow = scroller === window;
  const element = scroller as HTMLElement;
  const before = isWindow ? window.scrollY : element.scrollTop;
  const delta = direction === "up" ? -pixels : pixels;
  if (isWindow) {
    window.scrollBy({ top: delta, left: 0, behavior: "instant" });
  } else {
    element.scrollBy({ top: delta, left: 0, behavior: "instant" });
  }
  const after = isWindow ? window.scrollY : element.scrollTop;
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

function waitForSelector(selector: string, timeout: number): Promise<Record<string, unknown>> {
  if (document.querySelector(selector)) {
    return Promise.resolve({ text: `Selector found: ${selector}`, dialogs: drainDialogs() });
  }
  return new Promise((resolve) => {
    const started = Date.now();
    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve({ text: `Selector found: ${selector}`, dialogs: drainDialogs() });
      } else if (Date.now() - started > timeout) {
        observer.disconnect();
        resolve({
          error: { code: "timeout", message: `Timed out waiting for selector: ${selector}` },
          dialogs: drainDialogs(),
        });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve({
        error: { code: "timeout", message: `Timed out waiting for selector: ${selector}` },
        dialogs: drainDialogs(),
      });
    }, timeout);
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
  const all = candidateElements().filter((el) => toSnapshot(el).visible);
  const matches = all.filter((element) => matchesLocator(element, locator));
  const index = Math.max(0, locator.index ?? 0);
  return matches[index] ? [matches[index]] : [];
}

function matchesLocator(element: Element, locator: Locator): boolean {
  const role = inferRole(element);
  const name = accessibleName(element);
  const text = clean(element.textContent ?? "");
  const label = labelText(element);
  const placeholder = attr(element, "placeholder");
  const testid = attr(element, "data-testid") || attr(element, "data-test");
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
  if (testid) return { kind: "testid", value: testid, index: indexFor({ kind: "testid", value: testid, index: 0 }, element) };
  if (role && name) return { kind: "role", role, name, index: indexFor({ kind: "role", role, name, index: 0 }, element) };
  if (label) return { kind: "label", text: label, index: indexFor({ kind: "label", text: label, index: 0 }, element) };
  if (placeholder) {
    return { kind: "placeholder", text: placeholder, index: indexFor({ kind: "placeholder", text: placeholder, index: 0 }, element) };
  }
  return { kind: "text", text: text || name || role, index: indexFor({ kind: "text", text: text || name || role, index: 0 }, element) };
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

function describeElement(element: Element): string {
  const snap = toSnapshot(element);
  return `${snap.role}${snap.name ? ` "${snap.name}"` : ""}`;
}

function cssEscape(value: string): string {
  if ("CSS" in window && typeof CSS.escape === "function") return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}
}
