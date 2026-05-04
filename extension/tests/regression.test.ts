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
