import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("compiled MV2 scripts", () => {
  it("do not emit module export syntax", () => {
    for (const file of ["background.js", "content.js"]) {
      const body = readFileSync(resolve(import.meta.dirname, "..", "dist", file), "utf8");
      expect(body).not.toMatch(/\bexport\s*\{/);
      expect(body).not.toMatch(/\bimport\s+/);
    }
  });
});

describe("label locator regression", () => {
  it("keeps label text as metadata without making labels actionable candidates", () => {
    const body = readFileSync(resolve(import.meta.dirname, "..", "src", "content.ts"), "utf8");
    expect(body).toContain("labelText(element)");
    const selectorBlock = body.match(/const selector = \[([\s\S]*?)\]\.join/);
    expect(selectorBlock?.[1]).toBeTruthy();
    expect(selectorBlock?.[1]).not.toContain('"label"');
  });
});

describe("agent-browser compatibility foundations", () => {
  const content = () =>
    readFileSync(resolve(import.meta.dirname, "..", "src", "content.ts"), "utf8");
  const background = () =>
    readFileSync(resolve(import.meta.dirname, "..", "src", "background.ts"), "utf8");

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
    expect(body).toContain("async function activatePage(page: PageRecord)");
    expect(body).toContain("browser.windows.update(page.windowId, { focused: true })");
    expect(body).toContain("browser.tabs.update(page.tabId, { active: true })");
  });
});

describe("command shape parity", () => {
  const background = () =>
    readFileSync(resolve(import.meta.dirname, "..", "src", "background.ts"), "utf8");

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
