import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const installationBlocks = [
  h2("Global installation (recommended)", "global-installation-recommended"),
  code(`npm install -g pire-browser
pire-browser install  # register Firefox Native Messaging`),
  p("This is the fastest option. Commands run through the native Rust CLI and reuse managed Firefox sessions."),
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
  p("If an older GitHub install is still registered, remove it and install the npm package so Pi does not load duplicate tools."),
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
  h2("Updating", "updating"),
  code(`pire-browser upgrade
pire-browser update check --json
pire-browser update apply
pire-browser update configure --mode off|notify|patch`),
  p("<code>upgrade</code> checks for the latest package first, then applies a safe update using the same patch-only global/Pi-managed install rules as <code>update apply</code>."),
  h2("Doctor", "doctor"),
  code(`pire-browser doctor
pire-browser doctor --offline --quick
pire-browser doctor --json`),
  p("Doctor checks Firefox discovery, Native Messaging registration, extension build files, profile state, live sessions, PATH hints, and local policy diagnostics."),
  h2("Custom Firefox", "custom-firefox"),
  code(`# macOS/Linux
PIRE_BROWSER_FIREFOX_PATH=/path/to/firefox pire-browser install

# Windows PowerShell
$env:PIRE_BROWSER_FIREFOX_PATH = "D:\\Apps\\Mozilla Firefox\\firefox.exe"
pire-browser setup --firefox-path $env:PIRE_BROWSER_FIREFOX_PATH`),
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
