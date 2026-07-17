import { afterEach, describe, expect, it, vi } from "vitest";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  classifyUpdate,
  formatUpdatePlain,
  handleLauncherMissingNative,
  isEntrypoint,
  formatLauncherMissingNativeHelp,
  launcherInstallDiagnosticForMissingNative,
  main,
  nativeArgsNeedStdin,
  updateChannelForVersion,
  updateInstallCommand,
  updatePackageSpecForVersion,
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
const originalInstallKind = process.env.PIRE_BROWSER_INSTALL_KIND;
const originalPiInstallRoot = process.env.PIRE_BROWSER_PI_INSTALL_ROOT;
const originalPiSettingsPath = process.env.PIRE_BROWSER_PI_SETTINGS_PATH;
const originalPath = process.env.PATH;
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
  if (originalInstallKind === undefined) delete process.env.PIRE_BROWSER_INSTALL_KIND;
  else process.env.PIRE_BROWSER_INSTALL_KIND = originalInstallKind;
  if (originalPiInstallRoot === undefined) delete process.env.PIRE_BROWSER_PI_INSTALL_ROOT;
  else process.env.PIRE_BROWSER_PI_INSTALL_ROOT = originalPiInstallRoot;
  if (originalPiSettingsPath === undefined) delete process.env.PIRE_BROWSER_PI_SETTINGS_PATH;
  else process.env.PIRE_BROWSER_PI_SETTINGS_PATH = originalPiSettingsPath;
  process.env.PATH = originalPath;
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
    const upgradeHelp = logs.pop();
    expect(upgradeHelp).toContain("pire-browser upgrade [--json]");
    expect(upgradeHelp).toMatch(/beta and rc installs stay on their\s+matching prerelease channel/);

    expect(main(["update", "--help"])).toBe(0);
    expect(logs.pop()).toContain("pire-browser update check [--json]");

    expect(main(["skills", "--help"])).toBe(0);
    expect(logs.pop()).toContain("pire-browser skills get core [--full] [--json]");
    expect(main(["skills", "--help"])).toBe(0);
    expect(logs.pop()).toContain("pire-browser skills get dogfood [--full] [--json]");

    expect(main(["skill", "help"])).toBe(0);
    expect(logs.pop()).toContain("AGENT_BROWSER_SKILLS_DIR");

    expect(main(["pi", "--help"])).toBe(0);
    const piHelp = logs.pop();
    expect(piHelp).toContain("pire-browser pi repair");
    expect(piHelp).toContain("Exit codes:");
    expect(piHelp).toContain("data.remainingConflicts");
  });

  it("preserves stdin for native commands that require it through the Windows launcher", () => {
    expect(nativeArgsNeedStdin(["mcp", "--tools", "core"])).toBe(true);
    expect(nativeArgsNeedStdin(["chat"])).toBe(true);
    expect(nativeArgsNeedStdin(["chat", "--json"])).toBe(true);
    expect(nativeArgsNeedStdin(["eval", "--stdin"])).toBe(true);
    expect(nativeArgsNeedStdin(["auth", "save", "app", "--password-stdin"])).toBe(true);
    expect(nativeArgsNeedStdin(["cookies", "set", "--curl", "-"])).toBe(true);
    expect(nativeArgsNeedStdin(["batch"])).toBe(true);
    expect(nativeArgsNeedStdin(["batch", "--bail"])).toBe(true);

    expect(nativeArgsNeedStdin(["open", "https://example.com"])).toBe(false);
    expect(nativeArgsNeedStdin(["eval", "document.title"])).toBe(false);
    expect(nativeArgsNeedStdin(["cookies", "set", "--curl", "curl https://example.com"])).toBe(false);
    expect(nativeArgsNeedStdin(["batch", "snapshot -i"])).toBe(false);
    expect(nativeArgsNeedStdin(["batch", "--bail", "snapshot -i"])).toBe(false);
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

  it("serves install JSON repair guidance when native binary resolution fails", () => {
    const root = mkdtempTestRoot();
    process.env.PIRE_BROWSER_BINARY = join(root, "missing-pire-browser.exe");
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["install", "--json"])).toBe(1);

    const body = JSON.parse(logs.join("\n"));
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "native_binary_unavailable",
      },
      data: {
        ok: false,
        source: "launcher",
        command: "install",
      },
    });
    expect(body.error.message).toContain("Cannot run install");
    expect(body.data.nextActions.map((action) => action.code)).toContain("fix_binary_override");
    expect(body.data.nextActions.map((action) => action.code)).toContain("reinstall_optional_native_package");
  });

  it("serves top-level help when native binary resolution fails", () => {
    const root = mkdtempTestRoot();
    process.env.PIRE_BROWSER_BINARY = join(root, "missing-pire-browser.exe");
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["--help"])).toBe(0);
    const text = logs.join("\n");
    expect(text).toContain("Launcher-served commands available before native binary resolution");
    expect(text).toContain("skills get core");
    expect(text).toContain("mcp --tools core");
    expect(text).toContain("npm install -g pire-browser@");
    expect(text).toContain("--include=optional");
  });

  it("serves install help when native binary resolution fails", () => {
    const root = mkdtempTestRoot();
    process.env.PIRE_BROWSER_BINARY = join(root, "missing-pire-browser.exe");
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["install", "--help"])).toBe(0);

    const text = logs.join("\n");
    expect(text).toContain("pire-browser install [--with-deps]");
    expect(text).toContain("First-run setup command");
    expect(text).toContain("pire-browser open https://example.com");
    expect(text).toContain("pire-browser snapshot");
    expect(text).not.toContain("pire-browser snapshot -i");
    expect(text).not.toContain("pire-browser install status: needs attention");
  });

  it("serves help topic aliases when native binary resolution fails", () => {
    const text = formatLauncherMissingNativeHelp(
      ["help", "install"],
      {
        ok: false,
        tuple: "win32-x64",
        packageName: "@ryenw/pire-browser-win32-x64",
        reason: "Missing optional native package @ryenw/pire-browser-win32-x64@0.2.15 for win32-x64.",
      }
    );

    expect(text).toContain("pire-browser install [--with-deps]");
    expect(text).toContain("@ryenw/pire-browser-win32-x64");
  });

  it("explains native-only command help when native binary resolution fails", () => {
    const text = formatLauncherMissingNativeHelp(
      ["open", "--help"],
      {
        ok: false,
        tuple: "linux-x64",
        packageName: "@ryenw/pire-browser-linux-x64",
        reason: "Missing optional native package @ryenw/pire-browser-linux-x64@0.2.15 for linux-x64.",
      }
    );

    expect(text).toContain("Help for `open` requires the native platform package");
    expect(text).toContain("pire-browser skills get core");
    expect(text).toContain("--include=optional");
  });

  it("serves MCP startup guidance when native binary resolution fails", () => {
    const text = formatLauncherMissingNativeHelp(
      ["mcp", "--help"],
      {
        ok: false,
        tuple: "win32-x64",
        packageName: "@ryenw/pire-browser-win32-x64",
        reason: "Missing optional native package @ryenw/pire-browser-win32-x64@0.2.15 for win32-x64.",
      }
    );

    expect(text).toContain("pire-browser mcp --tools core");
    expect(text).toContain("Model Context Protocol server");
    expect(text).toContain("core` is a compact 31-tool inspect-before-act workflow");
    expect(text).toContain('"mcpServers"');
    expect(text).toContain('"args": ["mcp", "--tools", "core"]');
    expect(text).toContain("--tools core,debug");
    expect(text).toContain("Repair: npm install -g pire-browser@");
  });

  it("serves plain install guidance instead of a bare missing-native error", () => {
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));
    const result = handleLauncherMissingNative(
      ["install", "--with-deps"],
      {
        ok: false,
        tuple: "darwin-arm64",
        packageName: "@ryenw/pire-browser-darwin-arm64",
        reason: "Missing optional native package @ryenw/pire-browser-darwin-arm64@0.2.15 for darwin-arm64.",
      },
      { output: console.log }
    );

    expect(result).toBe(1);
    const text = logs.join("\n");
    expect(text).toContain("pire-browser install status: needs attention");
    expect(text).toContain("Cannot run install because the native pire-browser package is unavailable");
    expect(text).toContain("Native package: @ryenw/pire-browser-darwin-arm64");
    expect(text).toContain("--include=optional");
  });

  it("labels setup missing-native diagnostics with the setup command", () => {
    const diagnostic = launcherInstallDiagnosticForMissingNative(
      {
        ok: false,
        tuple: "linux-x64",
        packageName: "@ryenw/pire-browser-linux-x64",
        reason: "Missing optional native package @ryenw/pire-browser-linux-x64@0.2.15 for linux-x64.",
      },
      ["setup", "--firefox-path", "/opt/firefox/firefox"]
    );

    expect(diagnostic.command).toBe("setup");
    expect(diagnostic.message).toContain("Cannot run setup");
    expect(diagnostic.nextActions.map((action) => action.code)).toContain("reinstall_optional_native_package");
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
        reason: "Missing optional native package @ryenw/pire-browser-win32-x64@0.2.15 for win32-x64.",
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
        reason: "Missing optional native package @ryenw/pire-browser-linux-arm64@0.2.15 for linux-arm64.",
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
    expect(body.data.skill.content).toContain('"args": ["mcp", "--tools", "core"]');
    expect(body.data.skill.content).toContain("--tools core,debug");
    expect(body.data.skill.content).not.toContain("pire-browser profiler start");
    expect(Buffer.byteLength(body.data.skill.content, "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(body.data.skill.content).not.toContain("\r");
  });

  it("serves the extended core reference only when --full is requested", () => {
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    expect(main(["skills", "get", "core", "--full", "--json"])).toBe(0);

    const body = JSON.parse(logs.join("\n"));
    expect(body.data.skill.content).toContain("pire-browser profiler start");
    expect(body.data.skill.content).toContain("pire-browser network wait-for-response");
    expect(Buffer.byteLength(body.data.skill.content, "utf8")).toBeGreaterThan(32 * 1024);
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
    expect(body.data.skill.content).toContain(
      'SESSION="$(pire-browser session id --scope worktree --prefix dogfood)"'
    );
    expect(body.data.skill.content).toContain('--session "$SESSION"');
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

  it("follows installed prerelease channels and compares full semver precedence", () => {
    expect(updateChannelForVersion("0.3.0")).toBe("latest");
    expect(updateChannelForVersion("0.3.0-beta.1")).toBe("beta");
    expect(updateChannelForVersion("0.3.0-RC.2")).toBe("rc");
    expect(updateChannelForVersion("0.3.0-1")).toBe("next");
    expect(updatePackageSpecForVersion("0.3.0-beta.1")).toBe("pire-browser@beta");

    expect(classifyUpdate("0.3.0-beta.1", "0.3.0-beta.2")).toMatchObject({
      available: true,
      kind: "prerelease",
      targetVersion: "0.3.0-beta.2",
    });
    expect(classifyUpdate("0.3.0-beta.2", "0.3.0-beta.10")).toMatchObject({
      available: true,
      kind: "prerelease",
    });
    expect(classifyUpdate("0.3.0-beta.2", "0.3.0")).toMatchObject({ available: true, kind: "release" });
    expect(classifyUpdate("0.3.0-beta.2", "0.3.0-beta.1")).toMatchObject({ available: false, kind: "none" });
    expect(classifyUpdate("0.3.0-beta.2+build.1", "0.3.0-beta.2+build.2")).toMatchObject({
      available: false,
      kind: "none",
    });
  });

  it("builds exact-version npm and Pi update commands", () => {
    expect(updateInstallCommand({ kind: "global" }, "0.3.0-beta.2")).toEqual([
      "npm",
      ["install", "-g", "pire-browser@0.3.0-beta.2", "--include=optional"],
    ]);
    expect(updateInstallCommand({ kind: "pi", installRoot: join("C:", "pi", "agent", "npm") }, "0.3.0-beta.2")).toEqual([
      "npm",
      [
        "install",
        "pire-browser@0.3.0-beta.2",
        "--prefix",
        join("C:", "pi", "agent", "npm"),
        "--save-exact",
        "--include=optional",
        "--no-audit",
        "--no-fund",
      ],
    ]);
    expect(() => updateInstallCommand({ kind: "pi" }, "0.3.0-beta.2")).toThrow(
      "Pi update install root is required"
    );
  });

  it("applies an exact Pi update through its managed npm prefix and advances an exact settings pin", () => {
    const root = mkdtempTestRoot();
    const fakeBin = join(root, "fake-bin");
    const installRoot = join(root, "pi", "agent", "npm");
    const settingsPath = join(root, "pi", "agent", "settings.json");
    const dataHome = join(root, "data");
    const cacheDir = join(dataHome, "pire-browser", "updates");
    mkdirSync(fakeBin, { recursive: true });
    mkdirSync(installRoot, { recursive: true });
    mkdirSync(cacheDir, { recursive: true });
    const fakeNpm = join(fakeBin, process.platform === "win32" ? "npm.cmd" : "npm");
    writeFileSync(fakeNpm, process.platform === "win32" ? "@echo off\r\nexit /b 0\r\n" : "#!/bin/sh\nexit 0\n");
    if (process.platform !== "win32") chmodSync(fakeNpm, 0o755);
    writeSettings(settingsPath, ["npm:pire-browser@0.3.0-beta.2"]);
    writeFileSync(join(cacheDir, "cache.json"), JSON.stringify({
      checkedAt: Date.now(),
      available: true,
      kind: "prerelease",
      channel: "beta",
      currentVersion: "0.3.0-beta.2",
      targetVersion: "0.3.0-beta.3",
      latestVersion: "0.3.0-beta.3",
    }));
    process.env.PIRE_BROWSER_INSTALL_KIND = "pi";
    process.env.PIRE_BROWSER_PI_INSTALL_ROOT = installRoot;
    process.env.PIRE_BROWSER_PI_SETTINGS_PATH = settingsPath;
    process.env.LOCALAPPDATA = dataHome;
    process.env.XDG_DATA_HOME = dataHome;
    process.env.HOME = root;
    process.env.PATH = `${fakeBin}${delimiter}${originalPath ?? ""}`;
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    try {
      expect(main(["update", "apply", "--json"])).toBe(0);
      const body = JSON.parse(logs.join("\n"));
      expect(body).toMatchObject({
        success: true,
        data: {
          status: "applied",
          install: { kind: "pi", installRoot, settingsPath },
          piSettings: { ok: true, changed: true, reason: "advanced_exact_pin" },
        },
      });
      expect(body.data.command).toContain(`pire-browser@0.3.0-beta.3 --prefix ${installRoot}`);
      expect(JSON.parse(readFileSync(settingsPath, "utf8")).packages).toEqual([
        "npm:pire-browser@0.3.0-beta.3",
      ]);
      expect(existsSync(`${settingsPath}.pire-browser-update.bak`)).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects update cache entries from another installed version or channel", () => {
    const root = mkdtempTestRoot();
    process.env.LOCALAPPDATA = root;
    process.env.XDG_DATA_HOME = root;
    process.env.HOME = root;
    const cacheDir = join(root, "pire-browser", "updates");
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(join(cacheDir, "cache.json"), JSON.stringify({
      checkedAt: Date.now(),
      available: true,
      kind: "patch",
      channel: "latest",
      currentVersion: "0.2.35",
      targetVersion: "0.2.36",
      latestVersion: "0.2.36",
    }));
    const logs = [];
    vi.spyOn(console, "log").mockImplementation((line) => logs.push(String(line)));

    try {
      expect(main(["update", "apply", "--json"])).toBe(0);
      expect(JSON.parse(logs.join("\n"))).toMatchObject({
        success: true,
        data: {
          status: "current",
          update: {
            kind: "stale",
            channel: "beta",
            currentVersion: "0.3.0-beta.2",
            targetVersion: null,
          },
        },
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
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
        "Run `npm install pire-browser@0.3.0 --include=optional` in the project, or install globally with `npm install -g pire-browser@0.3.0 --include=optional`.",
    });

    expect(local).toContain("Target version is 0.3.0; current is 0.2.2.");
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
    ).toContain("pire-browser upgrade could not check the installed channel. Current version is 0.2.2.");
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
          channel: "beta",
          targetVersion: null,
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
