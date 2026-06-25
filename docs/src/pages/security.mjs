import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const securityBlocks = [
  h2("Threat model", "threat-model"),
  p("pire-browser is a local automation tool. It can navigate, read page text, evaluate JavaScript, and interact with forms, so agents should use domain and action guardrails in risky workflows."),
  h2("Output safety", "output-safety"),
  code(`pire-browser --content-boundaries snapshot -i
PIRE_BROWSER_CONTENT_BOUNDARIES=1 pire-browser snapshot -i --json
pire-browser --max-output 50000 get text body
PIRE_BROWSER_MAX_OUTPUT=50000 pire-browser get html body --json`),
  p("<code>--content-boundaries</code> labels page-sourced output for agents. <code>--max-output</code> caps emitted browser command text and reports <code>MAX_OUTPUT_TRUNCATED</code> when truncation occurs. These are best-effort output guards, not a browser sandbox or tokenizer-aware model budget."),
  h2("Domain allowlist", "domain-allowlist"),
  code(`pire-browser --allowed-domains "app.example.com,*.example.com" open https://app.example.com
PIRE_BROWSER_ALLOWED_DOMAINS="app.example.com" pire-browser snapshot -i`),
  h2("Action policy", "action-policy"),
  code(`{
  "default": "deny",
  "allow": ["navigate", "snapshot", "get"],
  "deny": ["eval", "download"]
}`),
  h2("Confirmation", "confirmation"),
  code(`pire-browser --confirm-actions eval,download eval "document.title"
pire-browser --confirm-actions plugin:vault:credential.read auth login app --credential-provider vault --item "My App"
pire-browser confirm c_8f3a1234
pire-browser deny c_8f3a1234`),
  h2("State files", "state-files"),
  p("State files may contain cookies or Web Storage secrets. They are plaintext by default for compatibility. Set <code>PIRE_BROWSER_ENCRYPTION_KEY</code> or the agent-browser-compatible <code>AGENT_BROWSER_ENCRYPTION_KEY</code> to a 64-character hex AES-256 key to write and load AES-256-GCM encrypted state files. Prefer <code>.pire-state/</code>, which this project gitignores, keep the key out of logs and shell history, and use <code>state inspect --record</code> before loading sensitive state."),
  h2("Auth vault", "auth-vault"),
  p("<code>auth save</code> stores selector-driven username/password profiles in a local AES-256-GCM encrypted auth vault under the OS app-data directory. The key comes from <code>PIRE_BROWSER_AUTH_ENCRYPTION_KEY</code>, <code>PIRE_BROWSER_ENCRYPTION_KEY</code>, <code>AGENT_BROWSER_ENCRYPTION_KEY</code>, or an auto-generated local key file. <code>auth list</code> and <code>auth show</code> never print passwords; <code>auth login</code> decrypts locally and sends a one-shot profile payload to the managed Firefox extension."),
  h2("Credential providers", "credential-providers"),
  code(`pire-browser plugin list
pire-browser plugin show vault
pire-browser auth login app --credential-provider vault --item "My App" --url https://example.com/login`),
  p("<code>plugin list</code> and <code>plugin show &lt;name&gt;</code> inspect configured agent-browser protocol plugins without running them. <code>auth login --credential-provider</code> runs a configured local plugin with capability <code>credential.read</code>. Keep vault tokens out of plugin args; use the vault vendor's own local session, keychain, or environment setup. This core login path suppresses plugin stderr and plugin-provided error text to reduce accidental secret exposure. Use <code>--confirm-actions plugin:&lt;name&gt;:credential.read</code> when provider access should require user approval before the plugin runs. Non-credential capabilities such as <code>browser.provider</code>, <code>launch.mutate</code>, and <code>command.run</code> are discoverable but not executed by this Firefox backend yet."),
];

export default page({
  path: "/security/",
  title: "Security",
  description: "Guardrails and local security model.",
  blocks: securityBlocks,
});
