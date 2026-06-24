import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_DELAY_MS,
  DEFAULT_POLL_MS,
  detectPiInstallContext,
  migratePiSettingsForKnownLegacySources,
  runWorker,
  shouldRetryMigrationReason,
} from "./pi-install-migration.mjs";

const tempRoots = [];

function tempDir() {
  const path = mkdtempSync(join(tmpdir(), "pire-pi-migration-test-"));
  tempRoots.push(path);
  return path;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("Pi install migration helper", () => {
  it("detects global Pi-managed npm package roots", () => {
    const context = detectPiInstallContext(
      join("C:", "Users", "me", ".pi", "agent", "npm", "node_modules", "pire-browser")
    );

    expect(context).toMatchObject({
      kind: "global",
      settingsPath: join("C:", "Users", "me", ".pi", "agent", "settings.json"),
    });
  });

  it("migrates known GitHub sources only after npm source exists", () => {
    const root = tempDir();
    const settingsPath = join(root, "settings.json");
    writeFileSync(
      settingsPath,
      `${JSON.stringify(
        {
          packages: [
            { source: "git:github.com/ryenwang/pire-browser" },
            { source: "npm:pire-browser" },
            { source: "npm:other-package" },
          ],
        },
        null,
        2
      )}\n`
    );

    const result = migratePiSettingsForKnownLegacySources(settingsPath);
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));

    expect(result).toMatchObject({
      changed: true,
      removed: ["git:github.com/ryenwang/pire-browser"],
      reason: "migrated",
    });
    expect(settings.packages.map((entry) => entry.source)).toEqual([
      "npm:pire-browser",
      "npm:other-package",
    ]);
  });

  it("retries transient Pi settings states while Pi install is still writing", async () => {
    const root = tempDir();
    const settingsPath = join(root, "settings.json");
    writeFileSync(settingsPath, "{");

    setTimeout(() => {
      writeFileSync(
        settingsPath,
        `${JSON.stringify({
          packages: [
            { source: "git:https://github.com/ryenwang/pire-browser" },
            { source: "npm:pire-browser" },
          ],
        })}\n`
      );
    }, 20);

    const result = await runWorker({
      settingsPath,
      delayMs: 0,
      pollMs: 5,
      timeoutMs: 500,
    });
    const settings = JSON.parse(readFileSync(settingsPath, "utf8"));

    expect(result.reason).toBe("migrated");
    expect(settings.packages).toEqual([{ source: "npm:pire-browser" }]);
  });

  it("keeps worker polling defaults short enough for immediate first-run repair", () => {
    expect(DEFAULT_DELAY_MS).toBeLessThanOrEqual(250);
    expect(DEFAULT_POLL_MS).toBeLessThanOrEqual(250);
  });

  it("distinguishes retryable migration states from terminal no-op states", () => {
    expect(shouldRetryMigrationReason("missing_settings")).toBe(true);
    expect(shouldRetryMigrationReason("invalid_settings: partial JSON")).toBe(true);
    expect(shouldRetryMigrationReason("missing_npm_source")).toBe(true);
    expect(shouldRetryMigrationReason("no_legacy_source")).toBe(false);
  });
});
