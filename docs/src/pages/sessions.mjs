import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const sessionsBlocks = [
  h2("Overview", "overview"),
  statusNote("namedSessions"),
  statusNote("managedProfiles"),
  p("Sessions are live Firefox extension connections. Named sessions map to managed Firefox profiles so agents can keep projects isolated."),
  h2("Session targeting", "session-targeting"),
  code(`SESSION="$(pire-browser session id --scope worktree --prefix my-app)"
pire-browser --session "$SESSION" --restore open https://app.example.com
pire-browser --session "$SESSION" --restore session info --json
pire-browser --session "$SESSION" --restore snapshot -i

pire-browser session --json
pire-browser session list
pire-browser session info --json
pire-browser session id --scope worktree --prefix my-app
pire-browser session id --scope worktree --prefix my-app --json
pire-browser session list --json
pire-browser session attach <session-id>
pire-browser session cleanup
pire-browser --session <uuid> snapshot -i
pire-browser --session work open https://example.com
pire-browser --session-name work open https://example.com
AGENT_BROWSER_SESSION=work pire-browser snapshot -i
pire-browser --session-name work snapshot -i
pire-browser --session-name work close`),
  p("For app QA, derive one stable worktree-scoped session name and pass it with <code>--session</code> and <code>--restore</code> on every command. This mirrors agent-browser's persistent-session recipe, but the persistence mechanism is the named managed Firefox profile. The name is deterministic for the current Git worktree and prefix, so separate projects do not collide. <code>session id --scope cwd</code> scopes to the current directory, and <code>--scope global</code> returns the sanitized prefix without a path hash."),
  p("Use <code>pire-browser session</code> or <code>pire-browser session --json</code> for the agent-browser-compatible current/default session diagnostic. Use <code>pire-browser --session &lt;name&gt; --restore session info --json</code> to inspect a selected live session, managed Firefox profile, restore status, and next actions without launching or mutating Firefox. Use <code>session list</code> when you need the full live-session inventory."),
  p("<code>--session &lt;uuid&gt;</code> targets a strict live session id from <code>session list</code>. <code>--session &lt;name&gt;</code>, <code>PIRE_BROWSER_SESSION=&lt;name&gt;</code>, <code>AGENT_BROWSER_SESSION=&lt;name&gt;</code>, <code>--session-name &lt;name&gt;</code>, <code>PIRE_BROWSER_SESSION_NAME=&lt;name&gt;</code>, and <code>AGENT_BROWSER_SESSION_NAME=&lt;name&gt;</code> are named-profile aliases that may reuse or launch managed Firefox. <code>--restore &lt;name&gt;</code> is a short spelling for <code>--session &lt;name&gt; --restore</code> when no session/profile target is already present. <code>--restore-save auto|always|never</code> is accepted for agent-browser recipe compatibility; named Firefox profiles persist automatically."),
  h2("Managed profiles", "managed-profiles"),
  code(`pire-browser profiles
pire-browser profiles --json
pire-browser profiles import default-release --name Work
pire-browser profiles import Default --name Work
pire-browser profiles import /path/to/firefox-profile --name Work
pire-browser profiles import /path/to/firefox-profile --name Work --overwrite
pire-browser --profile Work open https://example.com
PIRE_BROWSER_PROFILE=Work pire-browser snapshot -i
AGENT_BROWSER_PROFILE=Work pire-browser snapshot -i
pire-browser --profile ~/.myapp-profile open https://example.com`),
  p("<code>--profile &lt;name-or-path&gt;</code> reuses or launches a managed Firefox profile. Path-like values are mapped to stable managed Firefox profile names under the <code>pire-browser</code> data directory; they are not raw browser profile directories."),
  p("<code>profiles</code> lists managed <code>pire-browser</code> profiles plus importable local Mozilla Firefox profiles discovered from <code>profiles.ini</code>. <code>profiles import &lt;discovered-name-or-path&gt; --name &lt;managed-name&gt;</code> copies an existing Firefox profile into a managed profile for login continuity. <code>Default</code> selects the discovered default Firefox profile when one is present. It never mutates the source profile and future source changes do not sync. Close Firefox before importing so lock files and partially-written data are not copied; use <code>--overwrite</code> only after closing the managed profile being replaced."),
  h2("Logged-in QA starter", "logged-in-qa-starter"),
  code(`SESSION="$(pire-browser session id --scope worktree --prefix my-app)"
pire-browser profiles
pire-browser profiles import Default --name "$SESSION"
pire-browser --session "$SESSION" --restore open https://app.example.com
pire-browser --session "$SESSION" --restore session info --json
pire-browser --session "$SESSION" --restore snapshot
pire-browser --session "$SESSION" --restore screenshot`),
  p("This is the shortest recurring QA path when the user already has Firefox login state. Import the discovered <code>Default</code> or a named importable profile into the same managed profile name as the stable project session. On later runs, skip import and reuse the session command so cookies, tabs, IndexedDB, service workers, and saved Firefox login state stay isolated to that project."),
  h2("State persistence", "state-persistence"),
  code(`pire-browser --session-name work state save ./.pire-state/app-work.json
pire-browser --auto-connect state save ./.pire-state/app-work.json
PIRE_BROWSER_ENCRYPTION_KEY=<64-hex-key> pire-browser --session-name work state save ./.pire-state/app-work.json
AGENT_BROWSER_ENCRYPTION_KEY=<64-hex-key> pire-browser --session-name review state load ./.pire-state/app-work.json
pire-browser --session-name work --restore open https://app.example.com/dashboard
pire-browser --state ./.pire-state/app-work.json open https://app.example.com/dashboard
AGENT_BROWSER_STATE=./.pire-state/app-work.json pire-browser open https://app.example.com/dashboard
pire-browser --session-name review state load --require-inspected ./.pire-state/app-work.json`),
  p("Use <code>--session &lt;name&gt; --restore</code> for normal agent-browser-style QA continuity. State files are plaintext by default for compatibility and contain only active-origin cookies and Web Storage. Set <code>PIRE_BROWSER_ENCRYPTION_KEY</code> or <code>AGENT_BROWSER_ENCRYPTION_KEY</code> to a 64-character hex AES-256 key to save and load encrypted active-origin state files. <code>PIRE_BROWSER_STATE</code> and the agent-browser-compatible <code>AGENT_BROWSER_STATE</code> preload active-origin state before browser-control commands when no explicit <code>--state</code> is present."),
];

export default page({
  path: "/sessions/",
  title: "Sessions",
  description: "Live sessions and named Firefox profiles.",
  blocks: sessionsBlocks,
});
