import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const sessionsBlocks = [
  h2("Overview", "overview"),
  statusNote("namedSessions"),
  statusNote("managedProfiles"),
  p("Sessions are live Firefox extension connections. Named sessions map to managed Firefox profiles so agents can keep projects isolated."),
  h2("Session targeting", "session-targeting"),
  code(`pire-browser session list
pire-browser session list --json
pire-browser session attach <session-id>
pire-browser session cleanup
pire-browser --session <uuid> snapshot -i
pire-browser --session work open https://example.com
pire-browser --session-name work open https://example.com
pire-browser --session-name work snapshot -i
pire-browser --session-name work close`),
  p("<code>--session &lt;uuid&gt;</code> targets a strict live session id from <code>session list</code>. <code>--session &lt;name&gt;</code>, <code>PIRE_BROWSER_SESSION=&lt;name&gt;</code>, <code>--session-name &lt;name&gt;</code>, and <code>PIRE_BROWSER_SESSION_NAME=&lt;name&gt;</code> are named-profile aliases that may reuse or launch managed Firefox."),
  h2("Managed profiles", "managed-profiles"),
  code(`pire-browser profiles --json
pire-browser --profile Work open https://example.com
PIRE_BROWSER_PROFILE=Work pire-browser snapshot -i
pire-browser --profile ~/.myapp-profile open https://example.com`),
  p("<code>--profile &lt;name-or-path&gt;</code> reuses or launches a managed Firefox profile. Path-like values are mapped to stable managed Firefox profile names under the <code>pire-browser</code> data directory; they are not raw browser profile directories."),
  h2("State persistence", "state-persistence"),
  code(`pire-browser --session-name work state save ./.pire-state/app-work.json
pire-browser --auto-connect state save ./.pire-state/app-work.json
PIRE_BROWSER_ENCRYPTION_KEY=<64-hex-key> pire-browser --session-name work state save ./.pire-state/app-work.json
AGENT_BROWSER_ENCRYPTION_KEY=<64-hex-key> pire-browser --session-name review state load ./.pire-state/app-work.json
pire-browser --state ./.pire-state/app-work.json open https://app.example.com/dashboard
pire-browser --session-name review state load --require-inspected ./.pire-state/app-work.json`),
  p("State files are plaintext by default for compatibility. Set <code>PIRE_BROWSER_ENCRYPTION_KEY</code> or <code>AGENT_BROWSER_ENCRYPTION_KEY</code> to a 64-character hex AES-256 key to save and load encrypted active-origin state files."),
];

export default page({
  path: "/sessions/",
  title: "Sessions",
  description: "Live sessions and named Firefox profiles.",
  blocks: sessionsBlocks,
});
