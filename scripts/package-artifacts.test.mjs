import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PLATFORM_PACKAGES, packageDirectoryName, rootDir } from "./platform.mjs";
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

  it("requires packed browser smoke before trusted npm publish", () => {
    const publishWorkflow = readFileSync(join(root, ".github", "workflows", "npm-publish.yml"), "utf8");
    const releaseSmokeWorkflow = readFileSync(join(root, ".github", "workflows", "release-smoke.yml"), "utf8");

    expect(releaseSmokeWorkflow).toContain("workflow_call:");
    expect(releaseSmokeWorkflow).toMatch(/workflow_call:[\s\S]*target:[\s\S]*default: all/);
    expect(releaseSmokeWorkflow).toMatch(/workflow_call:[\s\S]*run_browser_smoke:[\s\S]*default: true/);
    expect(releaseSmokeWorkflow).toMatch(/workflow_call:[\s\S]*run_signed_xpi:[\s\S]*default: false/);

    expect(publishWorkflow).toMatch(
      /packed-browser-smoke:\s*\n\s*name: Packed browser smoke[\s\S]*uses: \.\/\.github\/workflows\/release-smoke\.yml/
    );
    expect(publishWorkflow).toMatch(/packed-browser-smoke:[\s\S]*target: all/);
    expect(publishWorkflow).toMatch(/packed-browser-smoke:[\s\S]*run_browser_smoke: true/);
    expect(publishWorkflow).toMatch(/publish:[\s\S]*needs:[\s\S]*packed-browser-smoke/);
  });
});
