import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { schedulePiPackageMigration } from "./pi-install-migration.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

if (process.env.PIRE_BROWSER_SKIP_POSTINSTALL === "1") {
  process.exit(0);
}

const launcher = join(root, "bin", "pire-browser.js");
const extensionManifest = join(root, "extension", "manifest.json");
const extensionBackground = join(root, "extension", "dist", "background.js");

for (const path of [launcher, extensionManifest, extensionBackground]) {
  if (!existsSync(path)) {
    console.error(`pire-browser: missing packaged file: ${path}`);
    process.exit(1);
  }
}

function scheduleMigrationIfNeeded() {
  const migration = schedulePiPackageMigration(root);
  if (migration.scheduled) {
    console.log(
      "pire-browser: scheduled Pi package reconciliation for npm:pire-browser."
    );
    console.log(
      "pire-browser: this best-effort cleanup runs only after Pi records npm:pire-browser. If Pi reports a duplicate tool conflict, run `npx -y pire-browser@latest pi repair`."
    );
  }
}


const args = [launcher, "setup"];
if (process.env.PIRE_BROWSER_FIREFOX_PATH) {
  args.push("--firefox-path", process.env.PIRE_BROWSER_FIREFOX_PATH);
}

const result = spawnSync(process.execPath, args, {
  stdio: "inherit",
  windowsHide: true,
  env: { ...process.env, PIRE_BROWSER_DISABLE_UPDATE_CHECK: "1" },
});
if (result.error) {
  console.warn(`pire-browser: setup could not run during postinstall: ${result.error.message}`);
  console.warn("pire-browser: install will continue. Run `pire-browser doctor` or `pire-browser setup` after install.");
  scheduleMigrationIfNeeded();
  process.exit(0);
}
if (result.status !== 0) {
  console.warn("pire-browser: setup did not complete during postinstall.");
  console.warn("pire-browser: install will continue. Set PIRE_BROWSER_FIREFOX_PATH if Firefox is installed in a custom location, then run `pire-browser setup` or a browser command that can lazy-setup.");
  scheduleMigrationIfNeeded();
  process.exit(0);
}

scheduleMigrationIfNeeded();
console.log("pire-browser: Pi package setup complete.");
