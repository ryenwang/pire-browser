import { afterEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  classifyUpdate,
  formatUpdatePlain,
  handleLauncherMissingNative,
  isEntrypoint,
  launcherInstallDiagnosticForMissingNative,
  main,
} from "../bin/pire-browser.js";

const originalOffline = process.env.PI_OFFLINE;
const originalPireSkillsDir = process.env.PIRE_BROWSER_SKILLS_DIR;
const originalAgentSkillsDir = process.env.AGENT_BROWSER_SKILLS_DIR;
const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;
const originalPiHome = process.env.PI_HOME;
const originalLocalAppData = process.env.LOCALAPPDATA;
const originalXdgDataHome = process.env.XDG_DATA_HOME;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalPireBinary = process.env.PIRE_BROWSER_BINARY;
const originalPireExe = process.env.PIRE_BROWSER_EXE;
const originalCwd = process.cwd();

afterEach(() => {
  if (originalOffline === undefined) delete process.env.PI_OFFLINE;
  else process.env.PI_OFFLINE = originalOffline;
  if (originalPireSkillsDir === undefined) delete process.env.PIRE_BROWSER_SKILLS_DIR;
  else process.env.PIRE_BROWSER_SKILLS_DIR = originalPireSkillsDir;
  if (originalAgentSkillsDir === undefined) delete process.env.AGENT_BROWSER_SKILLS_DIR;
  else process.env.AGENT_BROWSER_SKILLS_DIR = originalAgentSkillsDir;
  if (originalPiCodingAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
  if (originalPiHome === undefined) delete process.env.PI_HOME;
  else process.env.PI_HOME = originalPiHome;
  if (originalLocalAppData === undefined) delete process.env.LOCALAPPDATA;
  else process.env.LOCALAPPDATA = originalLocalAppData;
  if (originalXdgDataHome === undefined) delete process.env.XDG_DATA_HOME;
  else process.env.XDG_DATA_HOME = originalXdgDataHome;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  if (originalPireBinary === undefined) delete process.env.PIRE_BROWSER_BINARY;
  else process.env.PIRE_BROWSER_BINARY = originalPireBinary;
  if (originalPireExe === undefined) delete process.env.PIRE_BROWSER_EXE;
  else process.env.PIRE_BROWSER_EXE = originalPireExe;
  process.chdir(originalCwd);
  vi.restoreAllMocks();
});

function writeSettings(path, packages) {
  writeFileSync(path, `${JSON.stringify({ packages }, null, 2)}\n`);
}

function mkdtempTestRoot() {
  return mkdtempSync(join(tmpdir(), "pire-browser-launcher-test-"));
}

function setDataRootFileEnv(root) {
  const file = join(root, "data-root-file");
  writeFileSync(file, "not a directory");
  process.env.LOCALAPPDATA = file;
  process.env.XDG_DATA_HOME = file;
  process.env.HOME = file;
  process.env.USERPROFILE = file;
  return file;
}

describe("launcher update UX", () => {
  it("recognizes npm bin shims and normalized paths as the launcher entrypoint", () => {
    const temp = mkdtempTestRoot();
    try {
      const realLauncher = join(temp, "bin", "pire-browser.js");
      const shimDir = join(temp, "shim");
      mkdirSync(join(temp, "bin"), { recursive: true });
      mkdirSync(shimDir, { recursive: true });
      writeFileSync(realLauncher, "#!/usr/bin/env node\n");

      expect(isEntrypoint(join(shimDir, "..", "bin", "pire-browser.js"), pathToFileURL(realLauncher).href)).toBe(true);
      expect(isEntrypoint(join(temp, "bin", "other.js"), pathToFileURL(realLauncher).href)).toBe(false);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("recognizes npm shim scripts that invoke the installed launcher", () => {
    const temp = mkdtempTestRoot();
    try {
      const globalPackageRoot = join(temp, "global", "lib", "node_modules", "pire-browser");
      const globalLauncher = join(globalPackageRoot, "bin", "pire-browser.js");
      const globalShim = join(temp, "global", "bin", "pire-browser");
      mkdirSync(join(globalPackageRoot, "bin"), { recursive: true });
      mkdirSync(join(temp, "global", "bin"), { recursive: true });
      writeFileSync(join(globalPackageRoot, "package.json"), `${JSON.stringify({ name: "pire-browser" })}\n`);
      writeFileSync(globalLauncher, "#!/usr/bin/env node\n");
      writeFileSync(globalShim, "#!/bin/sh\nexec node ../lib/node_modules/pire-browser/bin/pire-browser.js \"$@\"\n");

      const localPackageRoot = join(temp, "project", "node_modules", "pire-browser");
      const localLauncher = join(localPackageRoot, "bin", "pire-browser.js");
      const localShim = join(temp, "project", "node_modules", ".bin", "pire-browser");
      mkdirSync(join(localPackageRoot, "bin"), { recursive: true });
      mkdirSync(join(temp, "project", "node_modules", ".bin"), { recursive: true });
      writeFileSync(join(localPackageRoot, "package.json"), `${JSON.stringify({ name: "pire-browser" })}\n`);
      writeFileSync(localLauncher, "#!/usr/bin/env node\n");
      writeFileSync(localShim, "#!/bin/sh\nexec node ../pire-browser/bin/pire-browser.js \"$@\"\n");

      expect(isEntrypoint(globalShim, pathToFileURL(globalLauncher).href)).toBe(true);
      expect(isEntrypoint(localShim, pathToFileURL(localLauncher).href)).toBe(true);
      expect(isEntrypoint(globalShim, pathToFileURL(localLauncher).href)).toBe(false);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it("serves launcher-owned help without invoking native commands", () => {
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["upgrade", "--help"])).toBe(0);
    expect(logs.pop()).toContain("pire-browser upgrade [--json]");

    expect(main(["update", "--help"])).toBe(0);
    expect(logs.pop()).toContain("pire-browser update check [--json]");

    expect(main(["skills", "--help"])).toBe(0);
    expect(logs.pop()).toContain("pire-browser skills get core [--json]");
    expect(main(["skills", "--help"])).toBe(0);
    expect(logs.pop()).toContain("pire-browser skills get dogfood [--json]");

    expect(main(["skill", "help"])).toBe(0);
    expect(logs.pop()).toContain("AGENT_BROWSER_SKILLS_DIR");

    expect(main(["pi", "--help"])).toBe(0);
    const piHelp = logs.pop();
    expect(piHelp).toContain("pire-browser pi repair");
    expect(piHelp).toContain("Exit codes:");
    expect(piHelp).toContain("data.remainingConflicts");
  });

  it("serves version output before native binary resolution", () => {
    const expectedVersion = JSON.parse(readFileSync(join(originalCwd, "package.json"), "utf8")).version;
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["--version"])).toBe(0);
    expect(logs.pop()).toBe(`pire-browser ${expectedVersion}`);

    expect(main(["-V"])).toBe(0);
    expect(logs.pop()).toBe(`pire-browser ${expectedVersion}`);

    expect(main(["version", "--json"])).toBe(0);
    expect(JSON.parse(logs.pop())).toMatchObject({
      success: true,
      data: {
        name: "pire-browser",
        version: expectedVersion,
      },
    });

    expect(main(["--json", "--version"])).toBe(0);
    expect(JSON.parse(logs.pop())).toMatchObject({
      success: true,
      data: {
        version: expectedVersion,
      },
    });
  });

  it("reports invalid version command arguments without invoking native commands", () => {
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["version", "--bad", "--json"])).toBe(2);

    expect(JSON.parse(logs.join("\n"))).toMatchObject({
      success: false,
      error: {
        code: "invalid_args",
        message: "unsupported version option: --bad",
      },
    });
  });

  it("serves doctor JSON repair guidance when native binary resolution fails", () => {
    const root = mkdtempTestRoot();
    process.env.PIRE_BROWSER_BINARY = join(root, "missing-pire-browser.exe");
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["doctor", "--json"])).toBe(1);

    const body = JSON.parse(logs.join("\n"));
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "native_binary_unavailable",
      },
      data: {
        ok: false,
        source: "launcher",
        command: "doctor",
        nativeBinary: {
          ok: false,
        },
      },
    });
    expect(body.data.nextActions.map((action) => action.code)).toContain("fix_binary_override");
    expect(body.data.nextActions.map((action) => action.code)).toContain("repair_pi_duplicate_if_needed");
  });

  it("formats missing optional native package guidance for install-status", () => {
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));
    const result = handleLauncherMissingNative(
      ["install-status"],
      {
        ok: false,
        tuple: "win32-x64",
        packageName: "@ryenw/pire-browser-win32-x64",
        reason: "Missing optional native package @ryenw/pire-browser-win32-x64@0.2.5 for win32-x64.",
      },
      { output: console.log }
    );

    expect(result).toBe(1);
    const text = logs.join("\n");
    expect(text).toContain("pire-browser install status: needs attention");
    expect(text).toContain("Native package: @ryenw/pire-browser-win32-x64");
    expect(text).toContain("npm install -g pire-browser@");
    expect(text).toContain("--include=optional");
    expect(text).toContain("npx -y pire-browser@latest pi repair");
  });

  it("builds missing optional native package nextActions for agents", () => {
    const diagnostic = launcherInstallDiagnosticForMissingNative(
      {
        ok: false,
        tuple: "linux-arm64",
        packageName: "@ryenw/pire-browser-linux-arm64",
        reason: "Missing optional native package @ryenw/pire-browser-linux-arm64@0.2.5 for linux-arm64.",
      },
      ["doctor", "--json"]
    );

    expect(diagnostic).toMatchObject({
      ok: false,
      command: "doctor",
      nativeBinary: {
        tuple: "linux-arm64",
        packageName: "@ryenw/pire-browser-linux-arm64",
      },
    });
    expect(diagnostic.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "reinstall_optional_native_package",
          command: expect.stringContaining("--include=optional"),
        }),
        expect.objectContaining({
          code: "check_optional_dependency_settings",
          command: "npm config get omit",
        }),
      ])
    );
  });

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
          {
            name: "dogfood",
          },
        ],
      },
    });
  });

  it("serves agent-browser-style dogfood skill from the JS launcher", () => {
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["skills", "get", "dogfood", "--json"])).toBe(0);

    const body = JSON.parse(logs.join("\n"));
    expect(body).toMatchObject({
      success: true,
      data: {
        skill: {
          name: "dogfood",
        },
      },
    });
    expect(body.data.skill.content).toContain("--session-name dogfood");
    expect(body.data.skill.content).toContain("not native WebM video");
    expect(body.data.skill.content).not.toContain("\r");
  });

  it("serves skills path and honors the agent-browser skills directory override", () => {
    const root = join(tmpdir(), `pire-skills-${process.pid}-${Date.now()}`);
    const skillDir = join(root, "custom");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      join(skillDir, "SKILL.md"),
      "---\nname: custom\ndescription: Custom launcher skill.\n---\n\n# Custom\n"
    );
    process.env.AGENT_BROWSER_SKILLS_DIR = root;
    delete process.env.PIRE_BROWSER_SKILLS_DIR;

    try {
      const logs = [];
      vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

      expect(main(["skills", "list", "--json"])).toBe(0);
      expect(JSON.parse(logs.pop())).toMatchObject({
        success: true,
        data: { skills: [{ name: "custom", description: "Custom launcher skill." }] },
      });

      expect(main(["skills", "path", "custom", "--json"])).toBe(0);
      expect(JSON.parse(logs.pop())).toMatchObject({
        success: true,
        data: { skill: { name: "custom", path: skillDir } },
      });

      expect(main(["skills", "get", "custom", "--json"])).toBe(0);
      expect(JSON.parse(logs.pop()).data.skill.content).toContain("# Custom");
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
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

    logs.length = 0;
    expect(main(["skills", "path", "--bad", "--json"])).toBe(1);
    expect(JSON.parse(logs.join("\n"))).toMatchObject({
      success: false,
      error: {
        message: "unsupported skills path option: --bad",
      },
    });
  });

  it("serves pi conflicts from the JS launcher and discovers global plus project settings", () => {
    const root = join(tmpdir(), `pire-pi-launcher-${process.pid}-${Date.now()}`);
    const project = join(root, "project");
    const piRoot = join(root, ".pi");
    mkdirSync(join(piRoot, "agent"), { recursive: true });
    mkdirSync(join(project, ".pi"), { recursive: true });
    writeSettings(join(piRoot, "agent", "settings.json"), [
      { source: "git:github.com/ryenwang/pire-browser" },
      { source: "npm:pire-browser" },
    ]);
    writeSettings(join(project, ".pi", "settings.json"), [
      { source: "git:https://github.com/ryenwang/pire-browser" },
      { source: "npm:pire-browser" },
    ]);
    process.env.PI_CODING_AGENT_DIR = piRoot;
    process.env.LOCALAPPDATA = join(root, "local-appdata");
    process.env.XDG_DATA_HOME = join(root, "xdg-data");
    process.env.HOME = join(root, "home");
    process.chdir(project);

    try {
      const logs = [];
      vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

      expect(main(["pi", "conflicts", "--json"])).toBe(0);

      const body = JSON.parse(logs.join("\n"));
      expect(body).toMatchObject({
        success: true,
        data: {
          operation: "conflicts",
          hasConflicts: true,
          conflictCount: 2,
        },
      });
      expect(body.data.conflicts.map((conflict) => conflict.scope).sort()).toEqual(["global", "project"]);
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("repairs global by default while reporting remaining project conflicts", () => {
    const root = join(tmpdir(), `pire-pi-repair-${process.pid}-${Date.now()}`);
    const project = join(root, "project");
    const piRoot = join(root, ".pi");
    mkdirSync(join(piRoot, "agent"), { recursive: true });
    mkdirSync(join(project, ".pi"), { recursive: true });
    const globalSettings = join(piRoot, "agent", "settings.json");
    const projectSettings = join(project, ".pi", "settings.json");
    writeSettings(globalSettings, [
      { source: "git:github.com/ryenwang/pire-browser" },
      { source: "npm:pire-browser" },
    ]);
    writeSettings(projectSettings, [
      { source: "git:github.com/ryenwang/pire-browser" },
      { source: "npm:pire-browser" },
    ]);
    process.env.PI_CODING_AGENT_DIR = piRoot;
    process.env.LOCALAPPDATA = join(root, "local-appdata");
    process.env.XDG_DATA_HOME = join(root, "xdg-data");
    process.env.HOME = join(root, "home");
    process.chdir(project);

    try {
      const logs = [];
      vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

      expect(main(["pi", "repair", "--json"])).toBe(0);

      const body = JSON.parse(logs.join("\n"));
      expect(body).toMatchObject({
        success: true,
        data: {
          operation: "repair",
          targets: [
            {
              scope: "global",
              changed: true,
              removed: ["git:github.com/ryenwang/pire-browser"],
            },
          ],
          remainingConflicts: [
            {
              scope: "project",
              kind: "legacy-github",
            },
          ],
        },
      });
      expect(JSON.parse(readFileSync(globalSettings, "utf8")).packages).toEqual([{ source: "npm:pire-browser" }]);
      expect(JSON.parse(readFileSync(projectSettings, "utf8")).packages).toEqual([
        { source: "git:github.com/ryenwang/pire-browser" },
        { source: "npm:pire-browser" },
      ]);
      expect(existsSync(body.data.reportPath)).toBe(true);
      expect(JSON.parse(readFileSync(body.data.reportPath, "utf8")).remainingConflicts).toHaveLength(1);
      expect(body.data.reportPath.endsWith(join("pi-repair", "latest.json"))).toBe(true);
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("skips missing auto-discovered settings but errors for missing explicit settings", () => {
    const root = join(tmpdir(), `pire-pi-missing-${process.pid}-${Date.now()}`);
    mkdirSync(root, { recursive: true });
    process.env.PI_CODING_AGENT_DIR = join(root, ".pi");
    process.env.LOCALAPPDATA = join(root, "local-appdata");
    process.env.XDG_DATA_HOME = join(root, "xdg-data");
    process.env.HOME = join(root, "home");
    process.chdir(root);

    try {
      const logs = [];
      const errors = [];
      vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));
      vi.spyOn(console, "error").mockImplementation((line) => errors.push(String(line)));

      expect(main(["pi", "conflicts", "--json"])).toBe(0);
      expect(JSON.parse(logs.pop()).data.targets.every((target) => target.skipped)).toBe(true);

      expect(main(["pi", "conflicts", "--settings", join(root, "missing-settings.json"), "--json"])).toBe(2);
      expect(JSON.parse(logs.pop())).toMatchObject({
        success: false,
        error: {
          message: expect.stringContaining("does not exist"),
        },
      });

      const invalidSettings = join(root, "invalid-settings.json");
      writeFileSync(invalidSettings, "{");
      expect(main(["pi", "repair", "--settings", invalidSettings, "--json"])).toBe(2);
      expect(JSON.parse(logs.pop())).toMatchObject({
        success: false,
        error: {
          code: "settings_unavailable",
          message: expect.stringContaining("Could not read Pi settings file"),
        },
      });
    } finally {
      process.chdir(originalCwd);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("dry-runs pi repair without changing settings or overwriting the real repair report", () => {
    const root = join(tmpdir(), `pire-pi-dry-run-${process.pid}-${Date.now()}`);
    const piRoot = join(root, ".pi");
    const settingsPath = join(piRoot, "agent", "settings.json");
    const realReportDir = join(root, "local-appdata", "pire-browser", "pi-repair");
    const realReportPath = join(realReportDir, "latest.json");
    mkdirSync(join(piRoot, "agent"), { recursive: true });
    mkdirSync(realReportDir, { recursive: true });
    writeFileSync(realReportPath, `${JSON.stringify({ real: true })}\n`);
    writeSettings(settingsPath, [
      { source: "git:github.com/ryenwang/pire-browser" },
      { source: "npm:pire-browser" },
    ]);
    process.env.PI_CODING_AGENT_DIR = piRoot;
    process.env.LOCALAPPDATA = join(root, "local-appdata");
    process.env.XDG_DATA_HOME = join(root, "xdg-data");
    process.env.HOME = join(root, "home");

    try {
      const logs = [];
      vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

      expect(main(["pi", "repair", "--dry-run", "--json"])).toBe(0);

      const body = JSON.parse(logs.join("\n"));
      expect(body.data.targets[0]).toMatchObject({
        dryRun: true,
        wouldChange: true,
        removed: ["git:github.com/ryenwang/pire-browser"],
      });
      expect(JSON.parse(readFileSync(settingsPath, "utf8")).packages).toEqual([
        { source: "git:github.com/ryenwang/pire-browser" },
        { source: "npm:pire-browser" },
      ]);
      expect(body.data.reportPath).toContain("pire-browser");
      expect(existsSync(body.data.reportPath)).toBe(true);
      expect(body.data.reportPath.endsWith(join("pi-repair", "dry-run-latest.json"))).toBe(true);
      expect(JSON.parse(readFileSync(realReportPath, "utf8"))).toEqual({ real: true });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("prints report write failures in plain pi repair output", () => {
    const root = join(tmpdir(), `pire-pi-report-failure-${process.pid}-${Date.now()}`);
    const piRoot = join(root, ".pi");
    const settingsPath = join(piRoot, "agent", "settings.json");
    mkdirSync(join(piRoot, "agent"), { recursive: true });
    writeSettings(settingsPath, [{ source: "npm:pire-browser" }]);
    process.env.PI_CODING_AGENT_DIR = piRoot;
    setDataRootFileEnv(root);

    try {
      const logs = [];
      vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

      expect(main(["pi", "repair"])).toBe(0);

      expect(logs.join("\n")).toContain("Report failed:");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
