import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLATFORM_PACKAGES, packageDirectoryName, resolveNativeBinary, rootDir } from "./platform.mjs";
import { normalizeRepositoryUrl } from "./verify-npm-artifacts.mjs";
import {
  expectedPackageSource,
  expectedVersionFromSource,
  parsePiInstallSmokeArgs,
  piInstallSmokeEnv,
  validateInstalledPackage,
  validatePiRpcCommands,
  validatePiSettings,
} from "./smoke-pi-install.mjs";
import {
  installCommandArgs,
  installedWebExtBin,
  packedMcpBrowserSmokeInput,
  packedMcpFilesSmokeInput,
  packedMcpNetworkSmokeInput,
  packedMcpSmokeInput,
  packedMcpStateSmokeInput,
  validatePackedMcpBrowserSmokeOutput,
  validatePackedMcpFilesSmokeOutput,
  validatePackedMcpNetworkSmokeOutput,
  validatePackedMcpSmokeOutput,
  validatePackedMcpStateSmokeOutput,
} from "./smoke-packed-package.mjs";
import {
  npxPackageCommandArgs,
  npxSmokeEnv,
  parseNpxPackageSmokeArgs,
  validateNpxSmokeOutputs,
} from "./smoke-npx-package.mjs";

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

  it("keeps Pi core imports as optional peers for lean direct npm installs", () => {
    const rootPackage = readJson(join(root, "package.json"));
    const piPeers = ["@earendil-works/pi-coding-agent", "@earendil-works/pi-tui", "typebox"];

    for (const peer of piPeers) {
      expect(rootPackage.peerDependencies?.[peer]).toBe("*");
      expect(rootPackage.peerDependenciesMeta?.[peer]).toEqual({ optional: true });
    }
  });

  it("declares web-ext as a runtime dependency for default browser launches", () => {
    const rootPackage = readJson(join(root, "package.json"));
    expect(rootPackage.dependencies?.["web-ext"]).toBe("^10.4.0");
  });

  it("prefers freshly built source binaries before optional sidecars and transitional checked-in binaries", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "pire-browser-platform-test-"));
    try {
      writeFileSync(join(tempRoot, "package.json"), `${JSON.stringify({ name: "pire-browser", version: "1.2.3" })}\n`);
      const checkedInBin = join(tempRoot, "bin", "win32-x64", "pire-browser.exe");
      const debugBin = join(tempRoot, "cli", "target", "debug", "pire-browser.exe");
      const optionalPackageRoot = join(tempRoot, "node_modules", "@ryenw", "pire-browser-win32-x64");
      const optionalBin = join(optionalPackageRoot, "bin", "pire-browser.exe");
      mkdirSync(join(tempRoot, "bin", "win32-x64"), { recursive: true });
      mkdirSync(join(tempRoot, "cli", "target", "debug"), { recursive: true });
      mkdirSync(join(optionalPackageRoot, "bin"), { recursive: true });
      writeFileSync(checkedInBin, "old");
      writeFileSync(debugBin, "new");
      writeFileSync(join(optionalPackageRoot, "package.json"), `${JSON.stringify({ name: "@ryenw/pire-browser-win32-x64" })}\n`);
      writeFileSync(optionalBin, "sidecar");

      expect(
        resolveNativeBinary({
          root: tempRoot,
          cwd: tempRoot,
          platform: "win32",
          arch: "x64",
          env: {},
        })
      ).toMatchObject({
        ok: true,
        path: debugBin,
        source: "development",
      });
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("keeps the Pi install smoke isolated from live Pi and native setup by default", () => {
    const options = parsePiInstallSmokeArgs(["--source", "npm:pire-browser@1.2.3", "--artifact-dir", "target/pi-smoke"]);
    expect(options.source).toBe("npm:pire-browser@1.2.3");
    expect(options.skipPostinstall).toBe(true);
    expect(options.installAttempts).toBe(3);
    expect(options.retryDelayMs).toBe(5000);
    expect(expectedPackageSource(options.source)).toBe("npm:pire-browser");
    expect(expectedVersionFromSource(options.source)).toBe("1.2.3");

    const env = piInstallSmokeEnv(
      {
        PI_CODING_AGENT_DIR: "live",
        PIRE_BROWSER_BINARY: "dev-bin",
        PIRE_BROWSER_EXE: "dev-exe",
      },
      "tmp-agent",
      options
    );
    expect(env.PI_CODING_AGENT_DIR).toBe("tmp-agent");
    expect(env.PIRE_BROWSER_SKIP_POSTINSTALL).toBe("1");
    expect(env.PIRE_BROWSER_BINARY).toBeUndefined();
    expect(env.PIRE_BROWSER_EXE).toBeUndefined();
  });

  it("constructs the no-global-install npx package smoke safely", () => {
    const options = parseNpxPackageSmokeArgs([
      "--tuple",
      "win32-x64",
      "--build-platform",
      "--pack-dir",
      "target/npx-pack",
      "--artifact-dir",
      "target/npx-artifacts",
    ]);
    expect(options.tuple).toBe("win32-x64");
    expect(options.buildPlatform).toBe(true);
    expect(options.packDir).toContain("target");
    expect(options.artifactDir).toContain("target");

    const env = npxSmokeEnv({
      PIRE_BROWSER_BINARY: "dev-bin",
      PIRE_BROWSER_EXE: "dev-exe",
    });
    expect(env.PIRE_BROWSER_BINARY).toBeUndefined();
    expect(env.PIRE_BROWSER_EXE).toBeUndefined();
    expect(env.PIRE_BROWSER_DISABLE_UPDATE_CHECK).toBe("1");
    expect(env.PIRE_BROWSER_SKIP_POSTINSTALL).toBe("1");
    expect(env.PI_OFFLINE).toBe("1");

    expect(
      npxPackageCommandArgs({
        rootTarball: "pire-browser-1.2.3.tgz",
        platformTarball: "ryenw-pire-browser-win32-x64-1.2.3.tgz",
        commandArgs: ["help", "window"],
      })
    ).toEqual([
      "exec",
      "--yes",
      "--package",
      "pire-browser-1.2.3.tgz",
      "--package",
      "ryenw-pire-browser-win32-x64-1.2.3.tgz",
      "--",
      "pire-browser",
      "help",
      "window",
    ]);
  });

  it("resolves installed web-ext from the packed package dependency tree", () => {
    expect(installedWebExtBin("pkg-root", "win32")).toBe(join("pkg-root", "node_modules", ".bin", "web-ext.cmd"));
    expect(installedWebExtBin("pkg-root", "darwin")).toBe(join("pkg-root", "node_modules", ".bin", "web-ext"));
    expect(installedWebExtBin("pkg-root", "linux")).toBe(join("pkg-root", "node_modules", ".bin", "web-ext"));
  });

  it("validates no-global-install npx smoke outputs", () => {
    expect(
      validateNpxSmokeOutputs({
        versionStdout: "0.2.24\n",
        helpStdout: "pire-browser window switch <wN>\npire-browser window close [wN]\n",
        skillsStdout: JSON.stringify({
          success: true,
          data: { skill: { name: "core", content: "pire-browser snapshot -i" } },
        }),
        expectedVersion: "0.2.24",
      })
    ).toMatchObject({ version: "0.2.24", helpChecked: true, skill: "core" });
    expect(() =>
      validateNpxSmokeOutputs({
        versionStdout: "0.2.24\n",
        helpStdout: "missing",
        skillsStdout: "{}",
        expectedVersion: "0.2.24",
      })
    ).toThrow(/window lifecycle/);
  });

  it("validates Pi settings and package manifest shape for the fresh install smoke", () => {
    expect(validatePiSettings({ packages: ["npm:pire-browser"] }, "npm:pire-browser@1.2.3")).toEqual([
      "npm:pire-browser",
    ]);
    expect(() => validatePiSettings({ packages: ["git:github.com/ryenwang/pire-browser"] }, "npm:pire-browser")).toThrow(
      /Pi settings did not include/
    );

    expect(() =>
      validateInstalledPackage(
        {
          name: "pire-browser",
          version: "1.2.3",
          pi: { extensions: ["pi/extensions/pire-browser.ts"], skills: ["skills"] },
        },
        "1.2.3"
      )
    ).not.toThrow();
    expect(() =>
      validateInstalledPackage(
        {
          name: "pire-browser",
          version: "1.2.3",
          pi: { extensions: [], skills: [] },
        },
        "1.2.3"
      )
    ).toThrow(/pi\.extensions/);
  });

  it("validates Pi runtime RPC discovery points at the installed package", () => {
    const packageRoot = join(root, "target", "fake-pi", "npm", "node_modules", "pire-browser");
    const stdout = `${JSON.stringify({
      id: "pire-runtime-smoke-commands",
      type: "response",
      command: "get_commands",
      success: true,
      data: {
        commands: [
          {
            name: "skill:pire-browser",
            description: "Use the installed pire-browser CLI.",
            source: "skill",
            sourceInfo: {
              path: join(packageRoot, "skills", "pire-browser", "SKILL.md"),
              source: "npm:pire-browser@1.2.3",
              baseDir: packageRoot,
            },
          },
        ],
      },
    })}\n`;

    expect(validatePiRpcCommands(stdout, packageRoot).skill.name).toBe("skill:pire-browser");
    expect(() =>
      validatePiRpcCommands(
        JSON.stringify({
          type: "response",
          command: "get_commands",
          success: true,
          data: { commands: [] },
        }),
        packageRoot
      )
    ).toThrow(/skill:pire-browser/);
  });

  it("validates packed-package MCP stdio smoke output", () => {
    expect(packedMcpSmokeInput()).toContain('"method":"initialize"');
    expect(packedMcpSmokeInput()).toContain('"name":"pire_browser_network_route"');
    expect(packedMcpSmokeInput()).toContain('"name":"pire_browser_tools_profiles"');

    const stdout = [
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          serverInfo: {
            name: "pire-browser",
            version: "0.2.20",
          },
        },
      }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        result: {
          content: [
            {
              type: "text",
              text: "tool `pire_browser_network_route` is not available in MCP tools profile `core`; it is available in `network`. Restart with `--tools core,network`, or use `--tools all` if the host can tolerate the full tool list.",
            },
          ],
        },
      }),
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        result: {
          structuredContent: {
            profiles: [
              { name: "core", active: true },
              { name: "network", active: false },
              { name: "all", active: false },
            ],
          },
        },
      }),
    ].join("\n");

    expect(validatePackedMcpSmokeOutput(stdout)).toMatchObject({
      responses: 3,
      serverVersion: "0.2.20",
      coreActive: true,
      networkActive: false,
      allActive: false,
    });
    expect(() => validatePackedMcpSmokeOutput("")).toThrow(/expected at least 3/);
    expect(() =>
      validatePackedMcpSmokeOutput(
        stdout.replace("--tools core,network", "--tools all")
      )
    ).toThrow(/profile-mismatch guidance/);
  });

  it("validates packed-package MCP browser smoke input and output", () => {
    const input = packedMcpBrowserSmokeInput({
      profile: "packed-mcp-test",
      url: "http://127.0.0.1:4321/form.html",
      screenshot: join(tmpdir(), "pire-browser-mcp-smoke.png"),
      executablePath: "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
    });
    for (const tool of [
      "pire_browser_open",
      "pire_browser_snapshot",
      "pire_browser_find",
      "pire_browser_wait_for_selector",
      "pire_browser_get_text",
      "pire_browser_get_value",
      "pire_browser_get_url",
      "pire_browser_get_title",
      "pire_browser_is_visible",
      "pire_browser_screenshot",
      "pire_browser_tab_list",
      "pire_browser_close",
    ]) {
      expect(input).toContain(`"name":"${tool}"`);
    }
    expect(input).toContain('"profile":"packed-mcp-test"');
    expect(input).toContain('"executablePath"');

    const stdout = [
      { jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "pire-browser", version: "0.2.20" } } },
      { jsonrpc: "2.0", id: 2, result: { isError: false, content: [{ type: "text", text: "opened" }] } },
      { jsonrpc: "2.0", id: 3, result: { isError: false, content: [{ type: "text", text: "@e1 input Email\n@e2 button Submit" }] } },
      { jsonrpc: "2.0", id: 4, result: { isError: false, content: [{ type: "text", text: "filled" }] } },
      { jsonrpc: "2.0", id: 5, result: { isError: false, content: [{ type: "text", text: "clicked" }] } },
      { jsonrpc: "2.0", id: 6, result: { isError: false, content: [{ type: "text", text: "waited" }] } },
      { jsonrpc: "2.0", id: 7, result: { isError: false, content: [{ type: "text", text: "Submitted" }] } },
      { jsonrpc: "2.0", id: 8, result: { isError: false, content: [{ type: "text", text: "mcp-smoke@example.com" }] } },
      { jsonrpc: "2.0", id: 9, result: { isError: false, content: [{ type: "text", text: "http://127.0.0.1:4321/form.html" }] } },
      { jsonrpc: "2.0", id: 10, result: { isError: false, content: [{ type: "text", text: "pire-browser fixture" }] } },
      { jsonrpc: "2.0", id: 11, result: { isError: false, content: [{ type: "text", text: "true" }] } },
      { jsonrpc: "2.0", id: 12, result: { isError: false, content: [{ type: "text", text: "screenshot" }] } },
      { jsonrpc: "2.0", id: 13, result: { isError: false, content: [{ type: "text", text: "tabs" }] } },
      { jsonrpc: "2.0", id: 14, result: { isError: false, content: [{ type: "text", text: "closed" }] } },
    ].map((message) => JSON.stringify(message)).join("\n");

    expect(validatePackedMcpBrowserSmokeOutput(stdout)).toEqual({
      responses: 14,
      serverVersion: "0.2.20",
      closeWarning: null,
    });
    expect(() => validatePackedMcpBrowserSmokeOutput(stdout.replace("@e1 input Email\\n@e2 button Submit", "input Email\\nbutton Submit"))).toThrow(
      /semantic refs/
    );
    expect(() =>
      validatePackedMcpBrowserSmokeOutput(
        stdout.replace('"isError":false,"content":[{"type":"text","text":"filled"}]', '"isError":true,"content":[{"type":"text","text":"fill failed"}]')
      )
    ).toThrow(/fill failed/);
    expect(validatePackedMcpBrowserSmokeOutput(
      stdout.replace('"isError":false,"content":[{"type":"text","text":"closed"}]', '"isError":true,"content":[{"type":"text","text":"close failed"}]')
    )).toMatchObject({ closeWarning: "close failed" });
    expect(() => validatePackedMcpBrowserSmokeOutput(stdout.replace("Submitted", "Still waiting"))).toThrow(/get_text/);
    expect(() => validatePackedMcpBrowserSmokeOutput(stdout.replace("mcp-smoke@example.com", "wrong@example.com"))).toThrow(/get_value/);
  });

  it("validates packed-package MCP network smoke input and output", () => {
    const harPath = join(tmpdir(), "pire-browser-mcp-network-smoke.har");
    writeFileSync(
      harPath,
      JSON.stringify({
        log: {
          entries: [
            {
              request: {
                method: "GET",
                url: "http://127.0.0.1:4321/api/status.json?source=network-smoke",
              },
            },
          ],
        },
      })
    );
    try {
      const input = packedMcpNetworkSmokeInput({
        profile: "packed-mcp-network-test",
        url: "http://127.0.0.1:4321/network.html",
        harPath,
        executablePath: "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      });
      for (const tool of [
        "pire_browser_open",
        "pire_browser_network_har_start",
        "pire_browser_find",
        "pire_browser_network_wait_for_request",
        "pire_browser_network_wait_for_response",
        "pire_browser_network_requests",
        "pire_browser_network_har_stop",
        "pire_browser_wait_for_text",
        "pire_browser_get_text",
        "pire_browser_close",
      ]) {
        expect(input).toContain(`"name":"${tool}"`);
      }
      expect(input).toContain('"profile":"packed-mcp-network-test"');

      const record = {
        requestId: "req_123",
        url: "http://127.0.0.1:4321/api/status.json?source=network-smoke",
        method: "GET",
        type: "xmlhttprequest",
        statusCode: 200,
      };
      const envelope = (data) => ({ success: true, data, warnings: [] });
      const stdout = [
        { jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "pire-browser", version: "0.2.20" } } },
        { jsonrpc: "2.0", id: 2, result: { isError: false, structuredContent: envelope({ text: "opened" }), content: [{ type: "text", text: "opened" }] } },
        { jsonrpc: "2.0", id: 3, result: { isError: false, structuredContent: envelope({ harRecording: { active: true } }), content: [{ type: "text", text: "started" }] } },
        { jsonrpc: "2.0", id: 4, result: { isError: false, structuredContent: envelope({ text: "clicked" }), content: [{ type: "text", text: "clicked" }] } },
        { jsonrpc: "2.0", id: 5, result: { isError: false, structuredContent: envelope({ request: record }), content: [{ type: "text", text: "Matched network request req_123" }] } },
        { jsonrpc: "2.0", id: 6, result: { isError: false, structuredContent: envelope({ request: record }), content: [{ type: "text", text: "Matched network response req_123 200" }] } },
        { jsonrpc: "2.0", id: 7, result: { isError: false, structuredContent: envelope({ requests: [record], count: 1 }), content: [{ type: "text", text: "req_123 200 GET" }] } },
        {
          jsonrpc: "2.0",
          id: 8,
          result: {
            isError: false,
            structuredContent: envelope({
              count: 1,
              path: harPath,
              har: {
                log: {
                  entries: [
                    {
                      request: {
                        method: "GET",
                        url: record.url,
                      },
                    },
                  ],
                },
              },
            }),
            content: [{ type: "text", text: `Wrote HAR to ${harPath}` }],
          },
        },
        { jsonrpc: "2.0", id: 9, result: { isError: false, structuredContent: envelope({ text: "waited" }), content: [{ type: "text", text: "waited" }] } },
        { jsonrpc: "2.0", id: 10, result: { isError: false, structuredContent: envelope({ text: "network fixture ready" }), content: [{ type: "text", text: "network fixture ready" }] } },
        { jsonrpc: "2.0", id: 11, result: { isError: true, structuredContent: { success: false, error: { code: "command_failed", message: "close failed for the targeted session" } }, content: [{ type: "text", text: "close failed for the targeted session" }] } },
      ].map((message) => JSON.stringify(message)).join("\n");

      expect(validatePackedMcpNetworkSmokeOutput(stdout, { harPath })).toEqual({
        responses: 11,
        serverVersion: "0.2.20",
        requests: 1,
        harEntries: 1,
        closeWarning: "close failed for the targeted session",
      });
      expect(() => validatePackedMcpNetworkSmokeOutput(stdout.replace("xmlhttprequest", "script"), { harPath })).toThrow(/fixture fetch request/);
      expect(() => validatePackedMcpNetworkSmokeOutput(stdout.replaceAll('"statusCode":200', '"statusCode":500'), { harPath })).toThrow(/2xx/);
      expect(() => validatePackedMcpNetworkSmokeOutput(stdout.replaceAll("network fixture ready", "still loading"), { harPath })).toThrow(/get_text/);
    } finally {
      rmSync(harPath, { force: true });
    }
  });

  it("validates packed-package MCP file transfer smoke input and output", () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "pire-browser-mcp-files-smoke-"));
    const uploadPath = join(tempRoot, "packed-mcp-upload.txt");
    const downloadPath = join(tempRoot, "download.txt");
    const waitDownloadPath = join(tempRoot, "wait-download.txt");
    const downloadDir = join(tempRoot, "browser-downloads");
    writeFileSync(uploadPath, "packed MCP upload fixture\n");
    writeFileSync(downloadPath, "packed MCP download fixture\n");
    writeFileSync(waitDownloadPath, "packed MCP download fixture\n");
    try {
      const input = packedMcpFilesSmokeInput({
        profile: "packed-mcp-files-test",
        url: "http://127.0.0.1:4321/files.html",
        uploadPath,
        downloadPath,
        waitDownloadPath,
        downloadDir,
        executablePath: "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      });
      for (const tool of [
        "pire_browser_open",
        "pire_browser_upload",
        "pire_browser_wait_for_text",
        "pire_browser_get_text",
        "pire_browser_click",
        "pire_browser_wait_download",
        "pire_browser_download",
        "pire_browser_close",
      ]) {
        expect(input).toContain(`"name":"${tool}"`);
      }
      expect(input).toContain('"profile":"packed-mcp-files-test"');
      expect(input).toContain('"downloadPath"');
      expect(input).toContain(uploadPath.replace(/\\/g, "\\\\"));

      const envelope = (data) => ({ success: true, data, warnings: [] });
      const ok = (id, text, data = { text }) => ({
        jsonrpc: "2.0",
        id,
        result: {
          isError: false,
          structuredContent: envelope(data),
          content: [{ type: "text", text }],
        },
      });
      const stdout = [
        { jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "pire-browser", version: "0.2.20" } } },
        ok(2, "opened"),
        ok(3, "Uploaded packed-mcp-upload.txt", { fileCount: 1 }),
        ok(4, "waited upload"),
        ok(5, "packed-mcp-upload.txt:27:packed MCP upload fixture"),
        ok(6, "clicked download link"),
        ok(7, `Downloaded ${waitDownloadPath}`, { path: waitDownloadPath }),
        ok(8, `Downloaded ${downloadPath}`, { path: downloadPath }),
        { jsonrpc: "2.0", id: 9, result: { isError: true, structuredContent: { success: false, error: { code: "command_failed", message: "close failed for the targeted session" } }, content: [{ type: "text", text: "close failed for the targeted session" }] } },
      ].map((message) => JSON.stringify(message)).join("\n");

      expect(validatePackedMcpFilesSmokeOutput(stdout, { uploadPath, downloadPath, waitDownloadPath })).toEqual({
        responses: 9,
        serverVersion: "0.2.20",
        uploadVerified: true,
        downloadVerified: true,
        waitDownloadVerified: true,
        closeWarning: "close failed for the targeted session",
      });
      expect(() =>
        validatePackedMcpFilesSmokeOutput(stdout.replaceAll("packed MCP upload fixture", "wrong upload"), { uploadPath, downloadPath, waitDownloadPath })
      ).toThrow(/upload summary/);
      writeFileSync(downloadPath, "wrong download\n");
      expect(() => validatePackedMcpFilesSmokeOutput(stdout, { uploadPath, downloadPath, waitDownloadPath })).toThrow(/fixture content/);
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("validates packed-package MCP state/auth smoke input and output", () => {
    const statePath = join(tmpdir(), "pire-browser-mcp-state-smoke.json");
    writeFileSync(statePath, JSON.stringify({ kind: "active-origin-state" }));
    try {
      const input = packedMcpStateSmokeInput({
        profile: "packed-mcp-state-test",
        url: "http://127.0.0.1:4321/state.html?value=mcp-state-smoke",
        clearUrl: "http://127.0.0.1:4321/state.html?clear=1",
        restoreUrl: "http://127.0.0.1:4321/state.html",
        formUrl: "http://127.0.0.1:4321/form.html",
        statePath,
        executablePath: "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
      });
      for (const tool of [
        "pire_browser_open",
        "pire_browser_wait_for_text",
        "pire_browser_state_save",
        "pire_browser_state_load",
        "pire_browser_storage_get",
        "pire_browser_cookies_list",
        "pire_browser_state_show",
        "pire_browser_auth_save",
        "pire_browser_auth_list",
        "pire_browser_auth_show",
        "pire_browser_auth_login",
        "pire_browser_auth_delete",
        "pire_browser_close",
      ]) {
        expect(input).toContain(`"name":"${tool}"`);
      }
      expect(input).toContain('"profile":"packed-mcp-state-test"');
      expect(input).toContain('"noRequireInspected":true');
      expect(input).toContain('"url":"http://127.0.0.1:4321/form.html"');

      const envelope = (data) => ({ success: true, data, warnings: [] });
      const ok = (id, text, data = { text }) => ({
        jsonrpc: "2.0",
        id,
        result: {
          isError: false,
          structuredContent: envelope(data),
          content: [{ type: "text", text }],
        },
      });
      const stdout = [
        { jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "pire-browser", version: "0.2.20" } } },
        ok(2, "opened"),
        ok(3, "waited"),
        ok(4, "saved", {
          path: statePath,
          cookies: 1,
          localStorageKeys: 1,
          sessionStorageKeys: 1,
        }),
        ok(5, "opened clear"),
        ok(6, "waited empty"),
        ok(7, "EMPTY"),
        ok(8, "EMPTY"),
        ok(9, "EMPTY"),
        ok(10, "opened neutral state page"),
        ok(11, "loaded", {
          path: statePath,
          cookiesSet: 1,
          localStorageKeys: 1,
          sessionStorageKeys: 1,
          reloaded: true,
        }),
        ok(12, "waited restored"),
        ok(13, "mcp-state-smoke"),
        ok(14, "mcp-state-smoke"),
        ok(15, "mcp-state-smoke"),
        ok(16, "mcp-state-smoke"),
        ok(17, "mcp-state-smoke"),
        ok(18, "pireStateCookie=mcp-state-smoke"),
        ok(19, "state summary", {
          path: statePath,
          counts: {
            cookies: 1,
            localStorageKeys: 1,
            sessionStorageKeys: 1,
          },
        }),
        ok(20, "Saved auth profile packed-mcp-auth", { profile: { name: "packed-mcp-auth" } }),
        ok(21, "packed-mcp-auth", { profiles: [{ name: "packed-mcp-auth" }] }),
        ok(22, "packed-mcp-auth #email #notes", { profile: { name: "packed-mcp-auth" } }),
        ok(23, "Logged in packed-mcp-auth"),
        ok(24, "waited done"),
        ok(25, "mcp-auth@example.com"),
        ok(26, "mcp-auth-secret"),
        ok(27, "Deleted auth profile packed-mcp-auth"),
        { jsonrpc: "2.0", id: 28, result: { isError: true, structuredContent: { success: false, error: { code: "command_failed", message: "close failed for the targeted session" } }, content: [{ type: "text", text: "close failed for the targeted session" }] } },
      ].map((message) => JSON.stringify(message)).join("\n");

      expect(validatePackedMcpStateSmokeOutput(stdout, { statePath })).toEqual({
        responses: 28,
        serverVersion: "0.2.20",
        cookies: 1,
        localStorageKeys: 1,
        sessionStorageKeys: 1,
        closeWarning: "close failed for the targeted session",
      });
      expect(() => validatePackedMcpStateSmokeOutput(stdout.replaceAll('"text":"mcp-state-smoke"', '"text":"wrong"'), { statePath })).toThrow(/restored/);
      expect(() => validatePackedMcpStateSmokeOutput(stdout.replace('"cookies":1', '"cookies":0'), { statePath })).toThrow(/capture/);
      expect(() => validatePackedMcpStateSmokeOutput(stdout.replace("Saved auth profile packed-mcp-auth", "Saved auth profile packed-mcp-auth mcp-auth-secret"), { statePath })).toThrow(/leaked/);
    } finally {
      rmSync(statePath, { force: true });
    }
  });

  it("waits for content-script readiness after state-load reloads", () => {
    const background = readFileSync(join(root, "extension", "src", "background.ts"), "utf8");
    const content = readFileSync(join(root, "extension", "src", "content.ts"), "utf8");

    expect(content).toContain('message.type === "pire_ready"');
    expect(background).toContain("await waitForContentScriptReady(tab.id, 5000)");
    expect(background).toContain("await waitForContentScriptReady(created.id, 5000)");
    expect(background).toMatch(/async function sendFrame[\s\S]*waitForContentScriptReady\(tabId, 3000\)[\s\S]*sendRawFrame\(tabId, frameId, message\)/);
    expect(background).toMatch(/async function sendRawFrame[\s\S]*browser\.tabs\.sendMessage\(tabId, message, target\)/);
    expect(background).toContain("await reloadTabAndWait(tab.tabId, 10000)");
    expect(background).toMatch(/async function reloadTabAndWait[\s\S]*browser\.tabs\.onUpdated\.addListener\(listener\)[\s\S]*browser\.tabs\.reload\(tabId\)/);
    expect(background).toContain("await waitForContentScriptReady(tab.tabId, 5000)");
    expect(background).toMatch(/async function waitForContentScriptReady[\s\S]*pire_ready[\s\S]*isFrameRoutingError/);
  });

  it("uses the public install path in packed-package release smoke", () => {
    expect(installCommandArgs()).toEqual(["install"]);
    expect(installCommandArgs({ firefoxPath: "/opt/firefox/firefox" })).toEqual([
      "install",
      "--firefox-path",
      "/opt/firefox/firefox",
    ]);

    const packedSmokeScript = readFileSync(join(root, "scripts", "smoke-packed-package.mjs"), "utf8");
    expect(packedSmokeScript).toContain('runPire(command, installCommandArgs({ firefoxPath })');
    expect(packedSmokeScript).toContain('runPire(command, ["install-status", "--json"]');
    expect(packedSmokeScript).not.toContain('const setupArgs = ["setup"]');
  });

  it("requires packed browser smoke before trusted npm publish", () => {
    const publishWorkflow = readFileSync(join(root, ".github", "workflows", "npm-publish.yml"), "utf8");
    const releaseSmokeWorkflow = readFileSync(join(root, ".github", "workflows", "release-smoke.yml"), "utf8");

    expect(releaseSmokeWorkflow).toContain("workflow_call:");
    expect(releaseSmokeWorkflow).toMatch(/workflow_call:[\s\S]*target:[\s\S]*default: all/);
    expect(releaseSmokeWorkflow).toMatch(/workflow_call:[\s\S]*run_browser_smoke:[\s\S]*default: true/);
    expect(releaseSmokeWorkflow).toMatch(/workflow_call:[\s\S]*run_signed_xpi:[\s\S]*default: false/);
    expect(releaseSmokeWorkflow).toContain("*mcp*.stdout.log");
    expect(releaseSmokeWorkflow).toContain("*mcp*.stderr.log");
    const packedSmokeScript = readFileSync(join(root, "scripts", "smoke-packed-package.mjs"), "utf8");
    expect(packedSmokeScript).toContain("runPackedMcpSmoke");
    expect(packedSmokeScript).toContain("runMcpBrowserSmoke");
    expect(packedSmokeScript).toContain("runMcpFilesSmoke");
    expect(packedSmokeScript).toContain("runMcpNetworkSmoke");
    expect(packedSmokeScript).toContain("runMcpStateSmoke");

    expect(publishWorkflow).toMatch(
      /packed-browser-smoke:\s*\n\s*name: Packed browser smoke[\s\S]*uses: \.\/\.github\/workflows\/release-smoke\.yml/
    );
    expect(publishWorkflow).toMatch(/packed-browser-smoke:[\s\S]*target: all/);
    expect(publishWorkflow).toMatch(/packed-browser-smoke:[\s\S]*run_browser_smoke: true/);
    expect(publishWorkflow).toMatch(/publish:[\s\S]*needs:[\s\S]*packed-browser-smoke/);
  });
});
