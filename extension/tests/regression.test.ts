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

function extensionFile(path: string) {
  return readFileSync(resolve(import.meta.dirname, "..", path), "utf8");
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

describe("agent-browser compatibility foundations", () => {
  const content = () => extensionFile("src/content.ts");
  const background = backgroundSource;

  it("uses frame-local handles so unnamed textbox refs are immediately actionable", () => {
    const body = content();
    expect(body).toContain('type Locator = NonHandleLocator | { kind: "handle"');
    expect(body).toContain("const handlesByElement = new WeakMap<Element, string>();");
    expect(body).toContain("return { kind: \"handle\", handle, fallback };");
    expect(body).toContain('if (role) return { kind: "role", role, index: indexFor({ kind: "role", role, index: 0 }, element) };');
  });

  it("accepts agent-browser selector families", () => {
    const body = background();
    expect(body).toContain('if (target.startsWith("text="))');
    expect(body).toContain('if (target.startsWith("xpath="))');
    expect(body).toContain('return { kind: "css", selector: target, index: -1 };');
    expect(body).toContain('kind === "label" || kind === "text" || kind === "placeholder" || kind === "alt" || kind === "title"');
    expect(body).toContain('kind === "first" || kind === "last" || kind === "nth"');
  });

  it("routes common agent-browser aliases and core actions", () => {
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

  it("documents wait fn as content-script isolated-world best effort", () => {
    const body = content();
    expect(body).toContain('bestEffortWarning("wait --fn"');
    expect(body).toContain("content-script isolated world");
    expect(body).toContain("page globals and framework state may not be visible");
  });

  it("maps dead frame routing errors to stale refs for frame-scoped actions", () => {
    const body = background();
    expect(body).toContain("staleOnFrameRoutingError");
    expect(body).toContain("function isFrameRoutingError");
    expect(body).toContain('code: "ref_stale"');
    expect(body).toContain("Frame ${frameId} is not available; run snapshot or find again");
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

  it("keeps default snapshot flat and ref-oriented rather than tree-shaped", () => {
    const body = background();
    const snapshotBlock = body.match(/async function snapshotCommand[\s\S]*?async function findCommand/)?.[0] ?? "";
    expect(snapshotBlock).toContain("refs.set(ref");
    expect(snapshotBlock).toContain("lines.push(`  ${ref} ${summarizeElement(element)}`)");
    expect(snapshotBlock).not.toContain("children");
    expect(snapshotBlock).not.toContain("accessibility");
  });
});

describe("command shape parity", () => {
  const background = backgroundSource;

  it("routes goto and navigate through the open command", () => {
    const body = background();
    expect(body).toContain('case "goto":');
    expect(body).toContain('case "navigate":');
    expect(body).toContain('return openCommand(rest, command || "open");');
  });

  it("allows bare open while keeping bare goto and navigate invalid", () => {
    const body = background();
    expect(body).toContain('if (command !== "open")');
    expect(body).toContain("`${command} requires <url>`");
    expect(body).toContain("Browser open in ${tab.agentId}");
  });

  it("parses plain waits with positional milliseconds before timeout fallback", () => {
    const body = background();
    expect(body).toContain('firstPositionalArg(args, ["--selector", "--timeout"])');
    expect(body).toContain("if (positional !== undefined) return parsePositiveInteger(positional, \"wait\");");
    expect(body).toContain("return parseTimeoutOption(args, 1000);");
    expect(body).toContain("return { text: `Waited ${waitResult.ms}ms` };");
  });

  it("rejects invalid waits and no longer caps plain waits at 1000ms", () => {
    const body = background();
    expect(body).toContain("Number.isInteger(ms)");
    expect(body).toContain("ms <= 0");
    expect(body).not.toContain("Math.min(timeout, 1000)");
    expect(body).not.toContain("Wait complete");
  });
});
