import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("manifest", () => {
  it("uses the expected extension id and native messaging permission", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "..", "manifest.json"), "utf8")
    );
    expect(manifest.browser_specific_settings.gecko.id).toBe("pire-browser@pi.local");
    expect(manifest.applications.gecko.id).toBe("pire-browser@pi.local");
    expect(manifest.permissions).toContain("nativeMessaging");
    expect(manifest.permissions).toContain("<all_urls>");
    expect(manifest.background.persistent).toBe(true);
    expect(manifest.content_scripts[0].all_frames).toBe(true);
  });
});
