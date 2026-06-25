import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const installationBlocks = [
  h2("Global installation (recommended)", "global-installation-recommended"),
  code(`npm install -g pire-browser
pire-browser install  # register Firefox Native Messaging`),
  p("This is the fastest option. Commands run through the native Rust CLI and reuse managed Firefox sessions."),
  p("<code>pire-browser install --with-deps</code> is the agent-browser-style first-run helper: it uses installed Firefox when available, can install Firefox through winget/Chocolatey on Windows or Homebrew on macOS when Firefox is missing, and gives non-Snap/non-Flatpak guidance on Linux."),
  h2("Quick start (no install)", "quick-start-no-install"),
  code(`npx pire-browser install   # register Firefox Native Messaging
npx pire-browser open https://example.com`),
  h2("Project installation (local dependency)", "project-installation-local-dependency"),
  code(`npm install pire-browser
npx pire-browser install
npx pire-browser snapshot -i`),
  p("Then use via <code>npx</code> or <code>package.json</code> scripts."),
  h2("Pi package", "pi-package"),
  code(`pi install npm:pire-browser`),
  p("If an older GitHub install is still registered, the npm package schedules a fast migration after Pi records the npm install. If Pi reports a duplicate <code>pire-browser</code> tool immediately after installation, wait a moment and rerun <code>pi</code>. If the conflict remains, remove the legacy GitHub install and reinstall the npm package."),
  code(`pi remove git:github.com/ryenwang/pire-browser
pi install npm:pire-browser`),
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
  p("<code>upgrade</code> checks for the latest package first, then applies a safe update using the same patch-only global/Pi-managed install rules as <code>update apply</code>."),
  h2("Doctor", "doctor"),
  code(`pire-browser doctor
pire-browser doctor --fix
pire-browser doctor --fix --with-deps
pire-browser doctor --fix --firefox-path /path/to/firefox
pire-browser doctor --offline --quick
pire-browser doctor --json`),
  p("Doctor checks Firefox discovery, Native Messaging registration, extension build files, profile state, live sessions, PATH hints, and local policy diagnostics. Plain doctor is read-only; <code>doctor --json</code> and <code>install-status --json</code> include <code>nextActions</code> with concrete repair commands, while <code>doctor --fix</code> explicitly reruns native host setup and verifies the follow-up status. <code>--with-deps</code> on install/setup/fix may install Firefox through winget/Chocolatey on Windows or Homebrew on macOS when Firefox is missing; Linux remains guided/manual to avoid Snap/Flatpak Native Messaging failures."),
  h2("Custom Firefox", "custom-firefox"),
  code(`# macOS/Linux
PIRE_BROWSER_FIREFOX_PATH=/path/to/firefox pire-browser install

# Windows PowerShell
$env:PIRE_BROWSER_FIREFOX_PATH = "D:\\Apps\\Mozilla Firefox\\firefox.exe"
pire-browser setup --firefox-path $env:PIRE_BROWSER_FIREFOX_PATH`),
  p("<code>--firefox-path</code> and <code>PIRE_BROWSER_FIREFOX_PATH</code> may point to the Firefox executable, a directory containing it, or <code>/Applications/Firefox.app</code> on macOS. If Firefox discovery fails during install, the error includes the platform's recommended repair command."),
  h2("AI agent setup", "ai-agent-setup"),
  code(`npx skills add ryenwang/pire-browser
pire-browser skills cat core`),
  p("Use the version-matched skill content from the installed package when an agent needs durable browser automation instructions."),
];

export default page({
  path: "/installation/",
  title: "Installation",
  description: "Install and diagnose pire-browser.",
  blocks: installationBlocks,
});
