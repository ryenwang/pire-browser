import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  BASELINE_METADATA_PATH,
  BASELINE_PACKAGE,
  expectedOracleVersion,
  readInstalledAgentBrowserVersion,
} from "./oracle-lib.mjs";

const version = expectedOracleVersion();
const env = { ...process.env, AGENT_BROWSER_ORACLE_REFRESH: "1" };

run("npm", ["run", "oracle:install"], env);
run("npm", ["run", "oracle:compare"], env);

const installed = readInstalledAgentBrowserVersion();
const metadata = JSON.parse(readFileSync(BASELINE_METADATA_PATH, "utf8"));
metadata.agentBrowser.version = installed;
metadata.agentBrowser.installCommand = `npm install --prefix target/agent-browser-oracle/npm ${BASELINE_PACKAGE}@${version} --no-save`;
metadata.agentBrowser.refreshedAt = new Date().toISOString();
writeFileSync(BASELINE_METADATA_PATH, `${JSON.stringify(metadata, null, 2)}\n`);

console.log(`Refreshed agent-browser oracle baseline metadata to ${BASELINE_PACKAGE}@${installed}.`);

function run(command, args, env) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
    env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
