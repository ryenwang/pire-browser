import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORM_PACKAGES, packageDirectoryName, rootDir } from "./platform.mjs";
import { normalizeRepositoryUrl } from "./verify-npm-artifacts.mjs";

const root = rootDir();

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("npm artifact metadata", () => {
  it("normalizes npm repository URL variants for provenance checks", () => {
    expect(normalizeRepositoryUrl({ url: "git+https://github.com/ryenwang/pire-browser.git" })).toBe(
      "https://github.com/ryenwang/pire-browser"
    );
    expect(normalizeRepositoryUrl({ url: "https://github.com/ryenwang/pire-browser.git/" })).toBe(
      "https://github.com/ryenwang/pire-browser"
    );
    expect(normalizeRepositoryUrl("git://github.com/ryenwang/pire-browser.git")).toBe(
      "https://github.com/ryenwang/pire-browser"
    );
  });

  it("keeps all platform package repositories aligned with the root package", () => {
    const rootPackage = readJson(join(root, "package.json"));
    const expected = normalizeRepositoryUrl(rootPackage.repository);

    for (const packageName of Object.values(PLATFORM_PACKAGES)) {
      const packageJson = readJson(join(root, "platform-packages", packageDirectoryName(packageName), "package.json"));
      expect(packageJson.name).toBe(packageName);
      expect(normalizeRepositoryUrl(packageJson.repository)).toBe(expected);
    }
  });
});
