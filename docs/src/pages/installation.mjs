import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const installationBlocks = [
  h2("Global installation", "global-installation"),
  code(`npm install -g pire-browser
pire-browser --version
pire-browser install  # register Firefox Native Messaging`),
  p("This is the recommended path for direct CLI use. <code>npm install</code> runs best-effort setup; <code>pire-browser install</code> is safe to run again and makes Firefox Native Messaging registration explicit. If npm policy blocks lifecycle scripts with <code>--ignore-scripts</code> or an <code>allow-scripts</code> warning, run <code>pire-browser install</code> after npm finishes."),
  h2("Pi package", "pi-package"),
  code(`pi install npm:pire-browser`),
  p("Use this when Pi should load the packaged extension and skill. After install, ask Pi to use <code>pire-browser</code> for browser automation."),
  h2("Project installation", "project-installation"),
  code(`npm install pire-browser
npx pire-browser --version
npx pire-browser install
npx pire-browser snapshot -i`),
  p("Use this when a project wants to pin the package version. Invoke through <code>npx pire-browser</code> or <code>package.json</code> scripts."),
  h2("First-run repair", "first-run-repair"),
  code(`pire-browser install --with-deps
pire-browser doctor --json`),
  p("Use this only when Firefox is missing or setup fails. <code>install --with-deps</code> is the agent-browser-style first-run helper: it uses installed Firefox when available, can install Firefox through winget/Chocolatey on Windows or Homebrew on macOS when Firefox is missing, and gives non-Snap/non-Flatpak guidance on Linux. <code>doctor --json</code> reports concrete <code>nextActions</code> when setup needs repair."),
  p("If the platform-native optional package was skipped during install, <code>--help</code>, <code>help</code>, setup/diagnostic/MCP command help, <code>install</code>, <code>setup</code>, <code>doctor --json</code>, and <code>install-status --json</code> still run from the JavaScript launcher and report the exact reinstall command, including <code>--include=optional</code>. If npm says postinstall scripts were skipped or blocked, run <code>pire-browser install</code> explicitly."),
  h2("Migrating from old GitHub/local installs", "migrating-from-old-github-local-installs"),
  p("Most users can skip this. If Pi reports that <code>npm:pire-browser</code> conflicts with an older GitHub, local-checkout, or ZIP-era install, inspect and repair the duplicate registration from a normal terminal."),
  code(`pire-browser pi conflicts
pire-browser pi repair`),
  p("If <code>pire-browser</code> is not on PATH because Pi cannot start, use the package directly."),
  code(`npx -y pire-browser@latest pi repair`),
  p("<code>pi repair</code> is the deterministic recovery path. The npm postinstall cleanup is best-effort and may not run when lifecycle scripts are skipped. Verified local checkout entries are reported but left in place unless you rerun with <code>--include-local</code>."),
  h2("From source", "from-source"),
  code(`git clone https://github.com/ryenwang/pire-browser
cd pire-browser
npm install
npm --prefix extension install
npm run build:extension
cd cli
cargo build
cargo run -p pire-browser-cli -- install
cd ..`),
  h2("Linux notes", "linux-notes"),
  p("Distro Firefox builds work best. Snap and Flatpak Firefox are detected, but sandboxed Native Messaging may require the WebExtensions portal or a non-sandboxed Mozilla Firefox build."),
  code(`pire-browser install --with-deps`),
  p("<code>--with-deps</code> does not run Linux package managers because distro defaults can install Snap/Flatpak Firefox. Install an unrestricted Mozilla package/tarball or distro non-Snap Firefox, then rerun <code>pire-browser install --firefox-path &lt;path&gt;</code> if discovery needs help."),
  h2("Updating", "updating"),
  code(`pire-browser upgrade
pire-browser update check --json
pire-browser update apply
pire-browser update configure --mode off|notify|patch`),
  p("<code>upgrade</code> is the agent-browser-style foreground update path: it checks npm, then updates global npm or Pi-managed installs to the latest package when no managed Firefox session is active. Local project installs print the exact project-local <code>npm install</code> command. Background auto-update and lower-level <code>update apply</code> stay patch-only. Update JSON uses <code>success: true</code> when the update command completed and reports the outcome in <code>data.status</code>; invalid arguments use <code>success: false</code>."),
  h2("Doctor", "doctor"),
  code(`pire-browser doctor
pire-browser doctor --fix
pire-browser doctor --fix --with-deps
pire-browser doctor --fix --firefox-path /path/to/firefox
pire-browser doctor --offline --quick
pire-browser doctor --json`),
  p("Doctor checks Firefox discovery, Native Messaging registration, extension build files, profile state, live sessions, PATH hints, and local policy diagnostics. Plain doctor is read-only; <code>doctor --json</code> and <code>install-status --json</code> include <code>nextActions</code> with concrete repair commands. If the optional native platform package is missing, top-level help, setup/diagnostic/MCP command help, <code>install</code>, <code>setup</code>, and those JSON diagnostics are still served by the JavaScript launcher and point to the <code>--include=optional</code> reinstall. <code>doctor --fix</code> explicitly reruns native host setup and verifies the follow-up status. <code>--with-deps</code> on install/setup/fix may install Firefox through winget/Chocolatey on Windows or Homebrew on macOS when Firefox is missing; Linux remains guided/manual to avoid Snap/Flatpak Native Messaging failures."),
  h2("Custom Firefox", "custom-firefox"),
  code(`# macOS/Linux
PIRE_BROWSER_FIREFOX_PATH=/path/to/firefox pire-browser install

# Windows PowerShell
$env:PIRE_BROWSER_FIREFOX_PATH = "D:\\Apps\\Mozilla Firefox\\firefox.exe"
pire-browser setup --firefox-path $env:PIRE_BROWSER_FIREFOX_PATH`),
  p("<code>--firefox-path</code> and <code>PIRE_BROWSER_FIREFOX_PATH</code> may point to the Firefox executable, a directory containing it, or <code>/Applications/Firefox.app</code> on macOS. If Firefox discovery fails during install, the error includes the platform's recommended repair command."),
  h2("AI agent setup", "ai-agent-setup"),
  code(`npx skills add ryenwang/pire-browser
pire-browser skills get core`),
  p("Use the version-matched skill content from the installed package when an agent needs durable browser automation instructions."),
];

export default page({
  path: "/installation/",
  title: "Installation",
  description: "Install and diagnose pire-browser.",
  blocks: installationBlocks,
});
