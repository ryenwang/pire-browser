import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  ORACLE_NPM_ROOT,
  ORACLE_ROOT,
  REPO_ROOT,
  expectedOracleVersion,
  readBaselineMetadata,
  readInstalledAgentBrowserVersion,
  resolveAgentBrowserExecutable,
  resolvePireExecutable,
} from "./oracle-lib.mjs";

function commandOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function where(command) {
  if (process.platform === "win32") {
    return commandOutput("where.exe", [command]).split(/\r?\n/).filter(Boolean);
  }
  return commandOutput("which", [command]).split(/\r?\n/).filter(Boolean);
}

function firstExisting(paths) {
  return paths.find((path) => path && existsSync(path)) || null;
}

const chromeCandidates =
  process.platform === "win32"
    ? [
        join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
      ]
    : where("google-chrome").concat(where("chromium"), where("chromium-browser"));

const firefoxCandidates =
  process.platform === "win32"
    ? [
        process.env.PIRE_BROWSER_FIREFOX_PATH,
        "C:\\Program Files\\Mozilla Firefox\\firefox.exe",
        "C:\\Program Files (x86)\\Mozilla Firefox\\firefox.exe",
      ]
    : where("firefox");

const report = {
  baseline: readBaselineMetadata().agentBrowser,
  expectedAgentBrowserVersion: expectedOracleVersion(),
  installedAgentBrowserVersion: readInstalledAgentBrowserVersion(),
  oracleNpmRoot: ORACLE_NPM_ROOT,
  oracleRoot: ORACLE_ROOT,
  agentBrowserExecutable: null,
  pireBrowserExecutable: null,
  chrome: {
    found: firstExisting(chromeCandidates),
    candidates: chromeCandidates.filter(Boolean),
  },
  firefox: {
    found: firstExisting(firefoxCandidates),
    candidates: firefoxCandidates.filter(Boolean),
  },
  profileDirs: {
    agentBrowserSocketDir: join(ORACLE_ROOT, "agent-browser-sockets"),
    pireBrowserLocalAppData: join(process.env.LOCALAPPDATA ?? "", "pire-browser"),
  },
  repoRoot: REPO_ROOT,
};

try {
  report.agentBrowserExecutable = resolveAgentBrowserExecutable({ requireExists: false });
} catch (error) {
  report.agentBrowserError = error.message;
}

try {
  report.pireBrowserExecutable = resolvePireExecutable({ requireExists: false });
} catch (error) {
  report.pireBrowserError = error.message;
}

console.log(JSON.stringify(report, null, 2));
