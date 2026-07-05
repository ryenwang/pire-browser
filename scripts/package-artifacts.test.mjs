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
  packedMcpBrowserSmokeInput,
  packedMcpNetworkSmokeInput,
  packedMcpSmokeInput,
  validatePackedMcpBrowserSmokeOutput,
  validatePackedMcpNetworkSmokeOutput,
  validatePackedMcpSmokeOutput,
} from "./smoke-packed-package.mjs";

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
    });
    expect(() => validatePackedMcpBrowserSmokeOutput(stdout.replace("@e1 input Email\\n@e2 button Submit", "input Email\\nbutton Submit"))).toThrow(
      /semantic refs/
    );
    expect(() =>
      validatePackedMcpBrowserSmokeOutput(
        stdout.replace('"isError":false,"content":[{"type":"text","text":"filled"}]', '"isError":true,"content":[{"type":"text","text":"fill failed"}]')
      )
    ).toThrow(/fill failed/);
    expect(() =>
      validatePackedMcpBrowserSmokeOutput(
        stdout.replace('"isError":false,"content":[{"type":"text","text":"closed"}]', '"isError":true,"content":[{"type":"text","text":"close failed"}]')
      )
    ).toThrow(/close failed/);
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
    expect(packedSmokeScript).toContain("runMcpNetworkSmoke");

    expect(publishWorkflow).toMatch(
      /packed-browser-smoke:\s*\n\s*name: Packed browser smoke[\s\S]*uses: \.\/\.github\/workflows\/release-smoke\.yml/
    );
    expect(publishWorkflow).toMatch(/packed-browser-smoke:[\s\S]*target: all/);
    expect(publishWorkflow).toMatch(/packed-browser-smoke:[\s\S]*run_browser_smoke: true/);
    expect(publishWorkflow).toMatch(/publish:[\s\S]*needs:[\s\S]*packed-browser-smoke/);
  });
});
