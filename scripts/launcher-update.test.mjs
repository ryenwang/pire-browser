import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyUpdate, formatUpdatePlain, main } from "../bin/pire-browser.js";

const originalOffline = process.env.PI_OFFLINE;

afterEach(() => {
  if (originalOffline === undefined) delete process.env.PI_OFFLINE;
  else process.env.PI_OFFLINE = originalOffline;
  vi.restoreAllMocks();
});

describe("launcher update UX", () => {
  it("serves agent-browser-style skills get core from the JS launcher before native resolution", () => {
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["skills", "get", "core", "--json"])).toBe(0);

    const body = JSON.parse(logs.join("\n"));
    expect(body).toMatchObject({
      success: true,
      data: {
        skill: {
          name: "core",
        },
      },
    });
    expect(body.data.skill.content).toContain("pire-browser skills get core");
    expect(body.data.skill.content).toContain("pire-browser skills get --all");
    expect(body.data.skill.content).not.toContain("\r");
  });

  it("serves skills get --all with the success/data envelope", () => {
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["skills", "get", "--all", "--json"])).toBe(0);

    const body = JSON.parse(logs.join("\n"));
    expect(body).toMatchObject({
      success: true,
      data: {
        skills: [
          {
            name: "core",
          },
        ],
      },
    });
  });

  it("reports invalid launcher-served skills requests without invoking native commands", () => {
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["skills", "get", "missing", "--json"])).toBe(1);

    expect(JSON.parse(logs.join("\n"))).toMatchObject({
      success: false,
      error: {
        code: "unsupported_command",
      },
    });
  });

  it("classifies semver changes for patch, minor, major, and current", () => {
    expect(classifyUpdate("0.2.2", "0.2.3")).toMatchObject({
      available: true,
      kind: "patch",
      currentVersion: "0.2.2",
      latestVersion: "0.2.3",
    });
    expect(classifyUpdate("0.2.2", "0.3.0")).toMatchObject({ available: true, kind: "minor" });
    expect(classifyUpdate("0.2.2", "1.0.0")).toMatchObject({ available: true, kind: "major" });
    expect(classifyUpdate("0.2.2", "0.2.2")).toMatchObject({ available: false, kind: "none" });
  });

  it("prints agent-browser-style current and applied upgrade messages", () => {
    expect(
      formatUpdatePlain({
        operation: "upgrade",
        status: "current",
        message: "already current",
        update: { currentVersion: "0.2.2", latestVersion: "0.2.2", kind: "none" },
      })
    ).toBe("pire-browser 0.2.2 is already current.");

    expect(
      formatUpdatePlain({
        operation: "upgrade",
        status: "applied",
        message: "updated to 0.2.3",
        update: { currentVersion: "0.2.2", latestVersion: "0.2.3", kind: "patch" },
      })
    ).toBe("pire-browser upgraded 0.2.2 -> 0.2.3.");
  });

  it("prints actionable local-install and minor-update hints", () => {
    const local = formatUpdatePlain({
      status: "notify",
      message: "local project installs are notify-only",
      update: { currentVersion: "0.2.2", latestVersion: "0.3.0", kind: "minor" },
      nextAction:
        "Run `npm install pire-browser@0.3.0 --include=optional` in the project, or install globally with `npm install -g pire-browser --include=optional`.",
    });

    expect(local).toContain("Latest is 0.3.0; current is 0.2.2.");
    expect(local).toContain("npm install pire-browser@0.3.0 --include=optional");

    const check = formatUpdatePlain({
      update: { available: true, kind: "minor", currentVersion: "0.2.2", latestVersion: "0.3.0" },
    });
    expect(check).toContain("pire-browser 0.3.0 is available (minor)");
    expect(check).toContain("Run `pire-browser upgrade` to update.");
  });

  it("prints offline and registry-failure checks without raw JSON", () => {
    expect(
      formatUpdatePlain({
        update: { available: false, kind: "offline", currentVersion: "0.2.2", latestVersion: null },
      })
    ).toBe("pire-browser update check skipped: offline mode is enabled. Current version is 0.2.2.");

    expect(
      formatUpdatePlain({
        operation: "upgrade",
        status: "unknown",
        message: "could not check the npm registry",
        update: { available: false, kind: "unknown", currentVersion: "0.2.2", latestVersion: null },
        nextAction: "Check network access or run `pire-browser update check --json` for details.",
      })
    ).toContain("pire-browser upgrade could not check the latest version. Current version is 0.2.2.");
  });

  it("keeps lower-level update wording distinct from foreground upgrade wording", () => {
    expect(
      formatUpdatePlain({
        operation: "update",
        status: "offline",
        message: "offline mode is enabled",
        update: { currentVersion: "0.2.2", latestVersion: null, kind: "offline" },
      })
    ).toBe("pire-browser update skipped: offline mode is enabled. Current version is 0.2.2.");
  });

  it("emits upgrade JSON through the launcher main path", () => {
    process.env.PI_OFFLINE = "1";
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["upgrade", "--json"])).toBe(0);

    const body = JSON.parse(logs.join("\n"));
    expect(body).toMatchObject({
      success: true,
      data: {
        status: "offline",
        operation: "upgrade",
        update: {
          kind: "offline",
          offline: true,
        },
      },
    });
  });

  it("keeps update apply plain output lower-level through the launcher main path", () => {
    process.env.PI_OFFLINE = "1";
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["update", "apply"])).toBe(0);

    expect(logs.join("\n")).toContain("pire-browser update skipped: offline mode is enabled.");
  });

  it("returns success false for invalid update arguments", () => {
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["update", "nonesuch", "--json"])).toBe(2);

    expect(JSON.parse(logs.join("\n"))).toMatchObject({
      success: false,
      error: {
        code: "invalid_args",
        message: "unsupported update command: nonesuch",
      },
    });
  });
});
