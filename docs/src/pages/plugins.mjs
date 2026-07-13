import { code, h2, list, note, p, page, table } from "../blocks.mjs";

const pluginsBlocks = [
  p("Plugins let pire-browser integrate with external tools without adding vendor SDKs, credentials, or fast-changing provider logic to core. A plugin is a local executable that reads one JSON request from stdin and writes one JSON response to stdout using the agent-browser plugin protocol."),
  p("Use plugins for vault-backed login, local Firefox launch customization, and domain-specific commands such as CAPTCHA solving. The current Firefox backend discovers browser-provider plugins but does not execute remote browser providers."),
  h2("When to write a plugin", "when-to-write-a-plugin"),
  p("Write a plugin when an integration needs a vendor CLI, local credentials, a paid API, or behavior that should not become a pire-browser dependency."),
  list([
    "Resolve login credentials from an external vault with <code>credential.read</code>.",
    "Append Firefox launch arguments, set a User-Agent, or provide init scripts with <code>launch.mutate</code>.",
    "Run a namespaced command with <code>command.run</code> or a custom capability such as <code>captcha.solve</code>.",
    "Keep vendor-specific login, SSO, CAPTCHA, and anti-detection integrations outside core.",
  ]),
  h2("Add a plugin", "add-a-plugin"),
  code(`pire-browser plugin add agent-browser-plugin-captcha
pire-browser plugin add @company/agent-browser-plugin-vault --name vault
pire-browser plugin add org/agent-browser-plugin-example

# Fallback when the executable does not expose plugin.manifest
pire-browser plugin add agent-browser-plugin-captcha --no-manifest --capability command.run --capability captcha.solve`),
  p("<code>plugin add</code> writes the discovered manifest and capabilities into pire-browser's agent-browser-compatible config. Use a package name, scoped npm package, or GitHub <code>owner/repo</code> reference."),
  h2("Inspect before running", "inspect-before-running"),
  code(`pire-browser plugin list
pire-browser plugin show vault

pire-browser auth login my-app --credential-provider vault --item "My App"
pire-browser plugin run captcha captcha.solve --payload '{"siteKey":"abc","url":"https://example.com"}'`),
  p("MCP users can inspect configured plugins with <code>pire_browser_plugin_list</code> and <code>pire_browser_plugin_show</code> from the state profile before choosing a credential provider."),
  h2("Capabilities", "capabilities"),
  table(["Capability", "Current Firefox behavior"], [
    ["<code>credential.read</code>", "Supported by <code>auth login --credential-provider &lt;name&gt;</code>; credentials are resolved locally and sent as a one-shot login payload."],
    ["<code>launch.mutate</code>", "Supported for Firefox launch args, User-Agent, and pre-navigation init scripts. Returned extension packages are reported as unsupported."],
    ["<code>command.run</code> and custom capabilities", "Supported through <code>plugin run &lt;name&gt; &lt;capability&gt; --payload &lt;json&gt;</code>."],
    ["<code>browser.provider</code>", "Discoverable in config but not executed by the local Firefox backend."],
  ]),
  h2("Protocol", "protocol"),
  code(`{
  "protocol": "agent-browser.plugin.v1",
  "type": "plugin.manifest",
  "capability": "plugin.manifest",
  "request": {}
}`),
  p("Successful responses use the same protocol with <code>success: true</code> and capability-specific data. Only stdout is parsed as protocol JSON. Plugin stderr and core-integration error text are suppressed where secrets could otherwise leak."),
  note("Do not put API tokens, vault tokens, or passwords in plugin args. Use the vendor's own CLI login, keychain, environment, or local session mechanism, and require confirmation for sensitive plugin capabilities.", "warn"),
];

export default page({
  path: "/plugins/",
  title: "Plugins",
  description: "Extend pire-browser with local credential, launch, and command integrations.",
  badge: "Partial",
  blocks: pluginsBlocks,
});
