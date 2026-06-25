import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  it("recognizes pinned SSH GitHub sources for the legacy repository", () => {
    const root = tempDir();
    const settingsPath = join(root, "settings.json");
    writeFileSync(
      settingsPath,
      `${JSON.stringify(
        {
          packages: [
            { source: "git:git@github.com:ryenwang/pire-browser@main" },
            { source: "ssh://git@github.com/ryenwang/pire-browser.git@v0.1.0" },
            { source: "npm:pire-browser" },
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
      removed: [
        "git:git@github.com:ryenwang/pire-browser@main",
        "ssh://git@github.com/ryenwang/pire-browser.git@v0.1.0",
      ],
      reason: "migrated",
    });
    expect(settings.packages).toEqual([{ source: "npm:pire-browser" }]);
  });

  it("removes local path installs that resolve to the same pire-browser package", () => {
    const root = tempDir();
    const settingsPath = join(root, ".pi", "agent", "settings.json");
    const localPackage = join(root, "browser-automation");
    mkdirSync(join(root, ".pi", "agent"), { recursive: true });
    mkdirSync(join(localPackage, "pi", "extensions"), { recursive: true });
    writeFileSync(join(localPackage, "package.json"), `${JSON.stringify({ name: "pire-browser" })}\n`);
    writeFileSync(join(localPackage, "pi", "extensions", "pire-browser.ts"), "");
    writeFileSync(
      settingsPath,
      `${JSON.stringify(
        {
          packages: [
            "../../browser-automation",
            { source: "npm:pire-browser" },
            { source: "../../other-package" },
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
      removed: ["../../browser-automation"],
      reason: "migrated",
    });
    expect(settings.packages).toEqual([
      { source: "npm:pire-browser" },
      { source: "../../other-package" },
    ]);
  });

  it("removes legacy direct extension shims from old Windows zip installs", () => {
    const root = tempDir();
    const settingsPath = join(root, ".pi", "agent", "settings.json");
    const shimPath = join(root, ".pi", "agent", "extensions", "pire-browser.ts");
    mkdirSync(join(root, ".pi", "agent", "extensions"), { recursive: true });
    writeFileSync(settingsPath, `${JSON.stringify({ packages: [{ source: "npm:pire-browser" }] })}\n`);
    writeFileSync(
      shimPath,
      `import { pathToFileURL } from "node:url";
export default async function(pi) {
  const mod = await import(pathToFileURL("C:/pire/pi/extensions/pire-browser.ts").href);
  return mod.default(pi);
}
`
    );

    const result = migratePiSettingsForKnownLegacySources(settingsPath);

    expect(result).toMatchObject({
      changed: true,
      removed: [],
      removedShims: [shimPath],
      reason: "migrated",
    });
    expect(existsSync(shimPath)).toBe(false);
    expect(existsSync(`${shimPath}.pire-browser-migration.bak`)).toBe(true);
  });

  it("quarantines verified legacy Pi-managed GitHub package directories", () => {
    const root = tempDir();
    const settingsPath = join(root, ".pi", "agent", "settings.json");
    const legacyPackage = join(root, ".pi", "agent", "git", "github.com", "ryenwang", "pire-browser");
    const backupPath = `${legacyPackage}.pire-browser-migration.bak`;
    mkdirSync(join(root, ".pi", "agent"), { recursive: true });
    mkdirSync(join(legacyPackage, "pi", "extensions"), { recursive: true });
    writeFileSync(settingsPath, `${JSON.stringify({ packages: [{ source: "npm:pire-browser" }] })}\n`);
    writeFileSync(join(legacyPackage, "package.json"), `${JSON.stringify({ name: "pire-browser" })}\n`);
    writeFileSync(join(legacyPackage, "pi", "extensions", "pire-browser.ts"), "");

    const result = migratePiSettingsForKnownLegacySources(settingsPath);

    expect(result).toMatchObject({
      changed: true,
      removed: [],
      quarantinedDirs: [legacyPackage],
      directoryBackupPaths: [backupPath],
      reason: "migrated",
    });
    expect(existsSync(legacyPackage)).toBe(false);
    expect(existsSync(backupPath)).toBe(true);
  });

  it("uses a numbered quarantine backup when the first legacy backup exists", () => {
    const root = tempDir();
    const settingsPath = join(root, ".pi", "agent", "settings.json");
    const legacyPackage = join(root, ".pi", "agent", "git", "github.com", "ryenwang", "pire-browser");
    const existingBackup = `${legacyPackage}.pire-browser-migration.bak`;
    const backupPath = `${existingBackup}.1`;
    mkdirSync(join(root, ".pi", "agent"), { recursive: true });
    mkdirSync(join(legacyPackage, "pi", "extensions"), { recursive: true });
    mkdirSync(existingBackup, { recursive: true });
    writeFileSync(settingsPath, `${JSON.stringify({ packages: [{ source: "npm:pire-browser" }] })}\n`);
    writeFileSync(join(legacyPackage, "package.json"), `${JSON.stringify({ name: "pire-browser" })}\n`);
    writeFileSync(join(legacyPackage, "pi", "extensions", "pire-browser.ts"), "");

    const result = migratePiSettingsForKnownLegacySources(settingsPath);

    expect(result).toMatchObject({
      changed: true,
      quarantinedDirs: [legacyPackage],
      directoryBackupPaths: [backupPath],
    });
    expect(existsSync(existingBackup)).toBe(true);
    expect(existsSync(backupPath)).toBe(true);
  });

  it("does not quarantine legacy GitHub package directories before the npm source exists", () => {
    const root = tempDir();
    const settingsPath = join(root, ".pi", "agent", "settings.json");
    const legacyPackage = join(root, ".pi", "agent", "git", "github.com", "ryenwang", "pire-browser");
    mkdirSync(join(root, ".pi", "agent"), { recursive: true });
    mkdirSync(join(legacyPackage, "pi", "extensions"), { recursive: true });
    writeFileSync(settingsPath, `${JSON.stringify({ packages: [{ source: "git:github.com/ryenwang/pire-browser" }] })}\n`);
    writeFileSync(join(legacyPackage, "package.json"), `${JSON.stringify({ name: "pire-browser" })}\n`);
    writeFileSync(join(legacyPackage, "pi", "extensions", "pire-browser.ts"), "");

    const result = migratePiSettingsForKnownLegacySources(settingsPath);

    expect(result).toMatchObject({
      changed: false,
      reason: "missing_npm_source",
    });
    expect(existsSync(legacyPackage)).toBe(true);
  });

  it("does not quarantine arbitrary directories in the legacy managed location", () => {
    const root = tempDir();
    const settingsPath = join(root, ".pi", "agent", "settings.json");
    const legacyPackage = join(root, ".pi", "agent", "git", "github.com", "ryenwang", "pire-browser");
    mkdirSync(join(root, ".pi", "agent"), { recursive: true });
    mkdirSync(join(legacyPackage, "pi", "extensions"), { recursive: true });
    writeFileSync(settingsPath, `${JSON.stringify({ packages: [{ source: "npm:pire-browser" }] })}\n`);
    writeFileSync(join(legacyPackage, "package.json"), `${JSON.stringify({ name: "not-pire-browser" })}\n`);
    writeFileSync(join(legacyPackage, "pi", "extensions", "pire-browser.ts"), "");

    const result = migratePiSettingsForKnownLegacySources(settingsPath);

    expect(result).toMatchObject({
      changed: false,
      removed: [],
      quarantinedDirs: [],
      reason: "no_legacy_source",
    });
    expect(existsSync(legacyPackage)).toBe(true);
  });

  it("does not remove arbitrary user extension files with the same basename", () => {
    const root = tempDir();
    const settingsPath = join(root, ".pi", "agent", "settings.json");
    const shimPath = join(root, ".pi", "agent", "extensions", "pire-browser.ts");
    mkdirSync(join(root, ".pi", "agent", "extensions"), { recursive: true });
    writeFileSync(settingsPath, `${JSON.stringify({ packages: [{ source: "npm:pire-browser" }] })}\n`);
    writeFileSync(shimPath, "export default function custom() { return null; }\n");

    const result = migratePiSettingsForKnownLegacySources(settingsPath);

    expect(result).toMatchObject({
      changed: false,
      removed: [],
      reason: "no_legacy_source",
    });
    expect(existsSync(shimPath)).toBe(true);
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
    expect(shouldRetryMigrationReason("legacy_directory_quarantine_failed")).toBe(false);
    expect(shouldRetryMigrationReason("no_legacy_source")).toBe(false);
  });
});
