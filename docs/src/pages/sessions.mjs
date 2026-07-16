import { code, h2, note, p, page, statusNote, table } from "../blocks.mjs";

const sessionsBlocks = [
  h2("Overview", "overview"),
  statusNote("namedSessions"),
  statusNote("managedProfiles"),
  p("Session identity, compact restore state, and Firefox profile source are independent. Ordinary sessions use temporary profiles. Add <code>--restore</code> for cookie/localStorage continuity, or use an explicit profile path for full browser-state durability."),

  h2("Ephemeral sessions", "ephemeral-sessions"),
  code(`pire-browser open https://example.com
pire-browser --session work open https://example.com
pire-browser --session work snapshot -i
pire-browser --session work close

pire-browser session list
pire-browser session info --json
pire-browser --session <uuid> snapshot -i`),
  p("<code>open</code> selects the <code>default</code> session. <code>--session &lt;name&gt;</code> selects an isolated live browser but does not make its Firefox profile durable. New profiles and default downloads live under the OS temporary directory and are removed after close. UUID targets refer only to an existing live session."),

  h2("Compact restore", "compact-restore"),
  code(`SESSION="$(pire-browser session id --scope worktree --prefix my-app)"
pire-browser --session "$SESSION" --restore open https://app.example.com
pire-browser --session "$SESSION" --restore snapshot -i
pire-browser --session "$SESSION" close

pire-browser --namespace qa --session worker --restore auth open https://app.example.com`),
  p("<code>--restore [key]</code> auto-loads and saves all profile cookies plus origin-keyed <code>localStorage</code>. The key defaults to the session name. State is saved every 30 seconds while commands are idle and on explicit close. Set <code>PIRE_BROWSER_AUTOSAVE_INTERVAL_MS=0</code> for close-only saving; <code>AGENT_BROWSER_AUTOSAVE_INTERVAL_MS</code> is an alias."),
  code(`pire-browser --session work --restore \
  --restore-save auto \
  --restore-check-url /dashboard \
  --restore-check-text Dashboard \
  open https://app.example.com/dashboard`),
  p("The default <code>auto</code> policy will not overwrite a known-good state after failed import or validation. <code>always</code> and <code>never</code> are explicit alternatives. Restore state expires after 30 days unless <code>PIRE_BROWSER_STATE_EXPIRE_DAYS</code> or its <code>AGENT_BROWSER_*</code> alias changes the interval. A value of <code>0</code> disables expiry."),
  note("Compact restore intentionally excludes IndexedDB, service workers, saved passwords, history, cache, and tabs. State files contain session tokens and are plaintext by default. Set PIRE_BROWSER_ENCRYPTION_KEY or AGENT_BROWSER_ENCRYPTION_KEY to a 64-character hex AES-256 key when encryption at rest is required.", "warn"),

  h2("Profile snapshots and durable paths", "profile-sources"),
  code(`pire-browser profiles
pire-browser --profile Default open https://example.com
pire-browser --profile Work --session review --restore open https://example.com

pire-browser --profile ./firefox-data open https://example.com
PIRE_BROWSER_PROFILE=./firefox-data pire-browser snapshot -i`),
  p("A profile name resolves a discovered or preserved Firefox source, copies it without volatile caches, and runs from a temporary snapshot. The source is never modified. A path is different: <code>--profile &lt;path&gt;</code> uses that directory directly as deliberately persistent browser data, including IndexedDB, service workers, history, and cache."),

  h2("Preserved 0.2.x profiles", "legacy-profiles"),
  code(`pire-browser profiles
pire-browser profiles usage --all
pire-browser profiles clean Work --dry-run
pire-browser profiles clean Work --yes
pire-browser profiles delete Work --yes`),
  p("Existing <code>firefox-profiles/*</code> directories are labeled legacy persistent profiles. They are never reused or deleted automatically. <code>profiles</code> prints each exact path and a durable <code>--profile &lt;path&gt;</code> command. Cache cleaning preserves storage, cookies, IndexedDB, extensions, and associated downloads. Delete works only for a stopped pire-browser-managed legacy profile."),

  h2("Manual state files", "manual-state-files"),
  code(`pire-browser state save ./.pire-state/app.json
pire-browser state load ./.pire-state/app.json
pire-browser state list
pire-browser state show restore:default/work
pire-browser state clean --older-than 30`),
  p("Current manual state files use the same multi-origin cookie/localStorage model as automatic restore. Legacy active-origin 0.2.x files remain readable. Automatic restore entries appear in <code>state list</code>; use <code>project:&lt;name&gt;</code> or <code>restore:&lt;namespace&gt;/&lt;key&gt;</code> for management operations."),

  h2("0.2.x migration", "migration"),
  table(
    ["0.2.x", "0.3.0", "What to do"],
    [
      ["<code>open</code> reused durable managed data", "Fresh temporary profile", "Add <code>--restore</code> or an explicit profile path"],
      ["Named session implied profile persistence", "Name selects only a live session", "Use <code>--session &lt;name&gt; --restore</code>"],
      ["<code>--session-name</code> selected a managed profile", "Deprecated session + restore alias", "Prefer <code>--session &lt;name&gt; --restore</code>"],
      ["Named profile was reused directly", "Named profile is copied to a temporary snapshot", "Use the exact legacy path when direct persistence is intentional"],
      ["Path-like profile was mapped to a managed name", "Path is used directly", "Choose a dedicated durable directory"],
      ["Default downloads accumulated in app data", "Default downloads are temporary", "Pass <code>--download-path</code> for durable files"],
    ],
  ),
];

export default page({
  path: "/sessions/",
  title: "Sessions",
  description: "Ephemeral Firefox sessions, compact restore state, and explicit profile durability.",
  blocks: sessionsBlocks,
});
