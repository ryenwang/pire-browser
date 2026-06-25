import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const configurationBlocks = [
  h2("Overview", "overview"),
  statusNote("configFiles"),
  p("pire-browser loads JSON defaults before command parsing. Config files and <code>PIRE_BROWSER_*</code> variables are the first-class public configuration surface for the current Firefox backend."),
  h2("Config files", "config-files"),
  code(`# from a project that has ./pire-browser.json
pire-browser open https://example.com
pire-browser --config ./ci-config.json open https://example.com
PIRE_BROWSER_CONFIG=./ci-config.json pire-browser open https://example.com`),
  p("Defaults are loaded from <code>~/.pire-browser/config.json</code>, <code>./pire-browser.json</code>, <code>PIRE_BROWSER_CONFIG</code>, and explicit <code>--config</code>, in that order. CLI flags override config defaults. Missing auto-discovered files are ignored; malformed auto-discovered files warn and continue. Explicit config paths must exist and contain a JSON object. Agent-browser-compatible aliases <code>~/.agent-browser/config.json</code>, <code>./agent-browser.json</code>, and <code>AGENT_BROWSER_CONFIG</code> are accepted for existing installs."),
  h2("Supported defaults", "supported-defaults"),
  p("Supported camelCase defaults include <code>json</code>, <code>profile</code>, <code>sessionName</code>, <code>session</code>, <code>state</code>, <code>autoConnect</code>, <code>allowedDomains</code>, <code>noAllowedDomains</code>, <code>actionPolicy</code>, <code>confirmActions</code>, <code>confirmInteractive</code>, <code>allowFileAccess</code>, <code>headed</code>, <code>headless</code>, <code>colorScheme</code>, <code>proxy</code>, <code>proxyBypass</code>, <code>downloadPath</code>, <code>maxOutput</code>, <code>contentBoundaries</code>, <code>engine</code>, <code>provider</code>, <code>model</code>, and <code>plugins</code>. Unknown keys are ignored so newer config files do not fail older installs."),
  code(`{
  "$schema": "./node_modules/pire-browser/pire-browser.schema.json",
  "json": true,
  "profile": "Work",
  "headless": true,
  "state": "./.pire-state/work.json",
  "allowedDomains": ["app.example.com", "*.example.com"],
  "proxy": "http://proxy.example:8080",
  "proxyBypass": "localhost,*.internal",
  "downloadPath": "./downloads",
  "autoConnect": true,
  "plugins": [
    {
      "name": "vault",
      "command": "agent-browser-plugin-vault",
      "capabilities": ["credential.read"]
    },
    {
      "name": "captcha",
      "command": "agent-browser-plugin-captcha",
      "capabilities": ["command.run", "captcha.solve"]
    }
  ]
}`, "json"),
  p("The packaged schema lives at <code>pire-browser.schema.json</code> in the repo and <code>./node_modules/pire-browser/pire-browser.schema.json</code> in an installed package. <code>headless: true</code> launches new managed Firefox sessions headlessly for CI while existing live sessions keep their current mode. <code>plugins</code> entries configure agent-browser-compatible credential providers and command/custom plugins; they do not synthesize CLI flags."),
  h2("Common flags", "common-flags"),
  code(`pire-browser --config ./ci-config.json open https://example.com
pire-browser --profile Work open https://example.com
pire-browser --session work open https://example.com
pire-browser --session-name work open https://example.com
pire-browser --auto-connect state save ./.pire-state/current.json
pire-browser --allowed-domains "example.com,*.example.com" snapshot -i
pire-browser --proxy http://proxy.example:8080 open https://example.com
pire-browser --proxy http://proxy.example:8080 --proxy-bypass "localhost,*.internal" open https://example.com
pire-browser --download-path ./downloads open https://example.com
pire-browser --headless open https://example.com
pire-browser --action-policy ./policy.json eval "document.title"
pire-browser --confirm-actions eval,download eval "document.title"
pire-browser --executable-path /path/to/firefox open https://example.com`),
  h2("Runtime settings", "runtime-settings"),
  statusNote("settings"),
  code(`pire-browser set viewport 1280 720
pire-browser device "iPhone 14"
pire-browser set device "iPhone 14"
pire-browser set viewport 390 844 3
pire-browser set geo 37.7749 -122.4194
pire-browser --color-scheme dark open https://example.com
pire-browser --proxy http://proxy.example:8080 open https://example.com
pire-browser set media light
pire-browser open https://api.example.com --headers '{"Authorization":"Bearer token"}'
pire-browser set headers '{"X-Custom-Header":"value"}'
pire-browser set credentials user pass
pire-browser set offline on
pire-browser set offline off`),
  p("Header values, HTTP Basic passwords, and proxy credentials are scoped to the current managed Firefox extension session and are not echoed in output. Viewport and device sizing are approximate because Firefox WebExtensions resize the browser window rather than a CDP viewport; <code>device</code> is the agent-browser-style spelling and <code>set device</code> remains compatible. Geolocation is a best-effort page-level navigator.geolocation shim. Offline mode is best-effort request blocking for managed tabs; it does not control navigator.onLine, service worker cache behavior, DNS, or socket state."),
  h2("Environment variables", "environment-variables"),
  table(["Variable", "Purpose"], [
    ["<code>PIRE_BROWSER_FIREFOX_PATH</code>", "Custom Firefox executable for setup or launch."],
    ["<code>PIRE_BROWSER_EXECUTABLE_PATH</code>", "Custom browser executable path accepted by launch commands."],
    ["<code>PIRE_BROWSER_EXTENSION_MODE</code>", "Use <code>xpi</code> only for direct XPI release validation."],
    ["<code>PIRE_BROWSER_REQUIRE_INSPECTED_STATE</code>", "Require a fresh local receipt before state load."],
    ["<code>PIRE_BROWSER_AUTH_ENCRYPTION_KEY</code>", "64-character hex AES-256 key for the auth vault; overrides the local generated key file."],
    ["<code>PIRE_BROWSER_ENCRYPTION_KEY</code>", "64-character hex AES-256 key for encrypted state files."],
    ["<code>AGENT_BROWSER_ENCRYPTION_KEY</code>", "Agent-browser-compatible alias for encrypted state files and auth vault storage."],
    ["<code>PIRE_BROWSER_CONFIG</code>", "Explicit JSON defaults path, equivalent to <code>--config</code>."],
    ["<code>PIRE_BROWSER_PROFILE</code>", "Default managed Firefox profile name or path-like profile value."],
    ["<code>PIRE_BROWSER_SESSION</code>", "Default strict session id or named-session alias."],
    ["<code>PIRE_BROWSER_SESSION_NAME</code>", "Default explicit named Firefox profile/session name."],
    ["<code>AGENT_BROWSER_PROFILE</code>", "Agent-browser-compatible alias for <code>PIRE_BROWSER_PROFILE</code>."],
    ["<code>AGENT_BROWSER_SESSION</code>", "Agent-browser-compatible alias for <code>PIRE_BROWSER_SESSION</code>."],
    ["<code>AGENT_BROWSER_SESSION_NAME</code>", "Agent-browser-compatible alias for <code>PIRE_BROWSER_SESSION_NAME</code>."],
    ["<code>PIRE_BROWSER_STATE</code>", "Default active-origin state file to preload before browser-control commands."],
    ["<code>AGENT_BROWSER_STATE</code>", "Agent-browser-compatible alias for <code>PIRE_BROWSER_STATE</code>."],
    ["<code>PIRE_BROWSER_INIT_SCRIPTS</code>", "OS path-list of document-start scripts to add to <code>open/goto/navigate &lt;url&gt;</code> when no explicit <code>--init-script</code> is present."],
    ["<code>AGENT_BROWSER_INIT_SCRIPTS</code>", "Agent-browser-compatible alias for <code>PIRE_BROWSER_INIT_SCRIPTS</code>."],
    ["<code>PIRE_BROWSER_ALLOWED_DOMAINS</code>", "Cooperative domain allowlist."],
    ["<code>PIRE_BROWSER_PROXY</code>", "Proxy URL for managed browser bridge commands."],
    ["<code>PIRE_BROWSER_PROXY_BYPASS</code>", "Firefox proxy passthrough hosts."],
    ["<code>PIRE_BROWSER_DOWNLOAD_PATH</code>", "Default Firefox download directory for newly launched managed sessions."],
    ["<code>AGENT_BROWSER_DOWNLOAD_PATH</code>", "Agent-browser-compatible alias for the default Firefox download directory."],
    ["<code>PIRE_BROWSER_PROXY_USERNAME</code>", "Proxy authentication username."],
    ["<code>PIRE_BROWSER_PROXY_PASSWORD</code>", "Proxy authentication password."],
    ["<code>AGENT_BROWSER_PROXY*</code>", "Agent-browser-compatible proxy aliases."],
    ["<code>AGENT_BROWSER_PLUGINS</code>", "JSON plugin array that replaces config plugin discovery for agent-browser-compatible credential providers."],
    ["<code>PIRE_BROWSER_PLUGINS</code>", "pire-browser alias for the same JSON plugin array."],
    ["<code>AI_GATEWAY_API_KEY</code>", "Enables <code>pire-browser chat</code> and the dashboard AI Chat panel through Vercel AI Gateway."],
    ["<code>AI_GATEWAY_MODEL</code>", "Optional model override for <code>chat</code> and dashboard chat, defaulting to <code>anthropic/claude-sonnet-4.6</code>."],
    ["<code>AI_GATEWAY_URL</code>", "Optional AI Gateway base URL override for <code>chat</code> and dashboard chat, defaulting to <code>https://ai-gateway.vercel.sh</code>."],
    ["<code>HTTP_PROXY</code> / <code>HTTPS_PROXY</code> / <code>ALL_PROXY</code> / <code>NO_PROXY</code>", "Standard proxy environment fallbacks."],
    ["<code>PIRE_BROWSER_ACTION_POLICY</code>", "Path to an action policy file."],
    ["<code>PIRE_BROWSER_CONFIRM_ACTIONS</code>", "Confirmation category list."],
    ["<code>PIRE_BROWSER_CONFIRM_INTERACTIVE</code>", "Enable interactive terminal prompts for confirmation-required actions."],
    ["<code>PIRE_BROWSER_CONTENT_BOUNDARIES</code>", "Enable boundary markers in large page-output commands."],
    ["<code>PIRE_BROWSER_MAX_OUTPUT</code>", "Default output truncation cap for guarded page-output commands."],
  ]),
  h2("Action policy", "action-policy"),
  code(`{
  "default": "deny",
  "allow": ["navigate", "snapshot", "get"],
  "deny": ["eval"]
}`),
  p("Supported policy fields are <code>default</code>, <code>allow</code>, and <code>deny</code>. Confirmation is configured separately with <code>--confirm-actions</code>."),
];

export default page({
  path: "/configuration/",
  title: "Configuration",
  description: "Flags, environment variables, and policy files.",
  blocks: configurationBlocks,
});
