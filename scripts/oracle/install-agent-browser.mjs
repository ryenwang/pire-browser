import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { get } from "node:https";
import { join } from "node:path";
import {
  BASELINE_PACKAGE,
  ORACLE_NPM_ROOT,
  expectedOracleVersion,
  readInstalledAgentBrowserVersion,
  resolveAgentBrowserExecutable,
  verifyInstalledAgentBrowserVersion,
} from "./oracle-lib.mjs";

const version = expectedOracleVersion();
mkdirSync(ORACLE_NPM_ROOT, { recursive: true });

const current = readInstalledAgentBrowserVersion();
if (current !== version) {
  const spec = `${BASELINE_PACKAGE}@${version}`;
  console.log(`Installing ${spec} into ${ORACLE_NPM_ROOT}`);
  const result = spawnSync("npm", ["install", "--prefix", ORACLE_NPM_ROOT, spec, "--no-save"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
} else {
  console.log(`agent-browser oracle already installed: ${BASELINE_PACKAGE}@${current}`);
}

const installed = verifyInstalledAgentBrowserVersion({ allowOverride: true });
if (process.platform === "win32") {
  await ensureWindowsX64Binary(version);
}
const executable = resolveAgentBrowserExecutable();
console.log(`Verified ${BASELINE_PACKAGE}@${installed}`);
console.log(`Executable: ${executable}`);

async function ensureWindowsX64Binary(version) {
  const packageBinDir = join(ORACLE_NPM_ROOT, "node_modules", BASELINE_PACKAGE, "bin");
  const binaryPath = join(packageBinDir, `${BASELINE_PACKAGE}-win32-x64.exe`);
  if (existsSync(binaryPath)) return;

  const url = `https://github.com/vercel-labs/agent-browser/releases/download/v${version}/${BASELINE_PACKAGE}-win32-x64.exe`;
  console.log(`Downloading Windows x64 oracle binary: ${url}`);
  await downloadFile(url, binaryPath);
}

function downloadFile(url, destination) {
  return new Promise((resolvePromise, reject) => {
    const request = (nextUrl) => {
      get(nextUrl, (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
          response.resume();
          request(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Failed to download ${nextUrl}: HTTP ${response.statusCode}`));
          return;
        }
        const file = createWriteStream(destination);
        response.pipe(file);
        file.on("finish", () => {
          file.close(resolvePromise);
        });
        file.on("error", (error) => {
          try {
            unlinkSync(destination);
          } catch {
            // Ignore cleanup errors.
          }
          reject(error);
        });
      }).on("error", reject);
    };
    request(url);
  });
}
