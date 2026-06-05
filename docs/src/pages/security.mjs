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
pire-browser confirm c_8f3a1234
pire-browser deny c_8f3a1234`),
  h2("State files", "state-files"),
  p("State files are plaintext and may contain cookies or Web Storage secrets. Prefer <code>.pire-state/</code>, which this project gitignores, and use <code>state inspect --record</code> before loading sensitive state."),
];

export default page({
  path: "/security/",
  title: "Security",
  description: "Guardrails and local security model.",
  blocks: securityBlocks,
});
