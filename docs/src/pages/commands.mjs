import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const commandsBlocks = [
  h2("Core", "core"),
  code(`pire-browser open                    # Launch managed Firefox if needed
pire-browser open <url>              # Navigate to a URL
pire-browser goto <url>              # Alias for navigation
pire-browser navigate <url>          # Alias for navigation
pire-browser read [url]              # Agent-friendly text; URL reads do not launch Firefox
pire-browser click <sel>             # Click ref or selector
pire-browser tap <sel>               # Best-effort tap alias for click
pire-browser dblclick <sel>          # Double-click ref or selector
pire-browser fill <sel> <text>       # Clear and fill
pire-browser type <sel> <text>       # Type into element
pire-browser press <key>             # Press key such as Enter or Tab
pire-browser keyboard type <text>    # Type with current-focus key events
pire-browser keyboard inserttext <text> # Insert text at focus without key events
pire-browser keydown <key>           # Hold key down at current focus
pire-browser keyup <key>             # Release key at current focus
pire-browser hover <sel>             # Hover element
pire-browser focus <sel>             # Focus element
pire-browser select <sel> <value>    # Select dropdown option
pire-browser check <sel>             # Check checkbox
pire-browser uncheck <sel>           # Uncheck checkbox
pire-browser scroll <dir> [px]       # Scroll page or container
pire-browser scrollintoview <sel>    # Scroll element into view
pire-browser swipe up [px]           # Best-effort mobile swipe as page scroll
pire-browser drag <src> <dst>        # Drag and drop with page-level events
pire-browser upload <sel> <files>    # Assign local file input payloads
pire-browser screenshot [path]       # Capture screenshot evidence
pire-browser pdf page.pdf            # Capture image-backed PDF evidence
pire-browser snapshot -i             # Accessibility tree with refs
pire-browser snapshot -i -C          # Include cursor-pointer custom controls
pire-browser eval <js>               # Run JavaScript with policy checks
pire-browser close                   # Close targeted session`),
  p("Refs must usually be quoted in PowerShell, for example <code>pire-browser click '@e2'</code>. Re-run <code>snapshot -i</code> after navigation, DOM changes, dialogs, downloads, or failed actions. Use <code>snapshot -i -C</code> when custom clickable cards, menu rows, or cursor-pointer controls are missing from the default snapshot. If a click reports that the target is covered by another element, handle the covering element first, then re-snapshot before retrying."),
  p("<code>tap</code> uses the same Firefox WebExtension page-level click path as <code>click</code>; it is not native touch input or mobile browser chrome emulation. <code>swipe</code> maps touch direction to page scroll, so <code>swipe up</code> scrolls down. Use <code>scroll</code> when you want direct scroll direction."),
  p("<code>keyboard type</code>, <code>keyboard inserttext</code>, <code>keydown</code>, and <code>keyup</code> act at the current page focus. Click or focus the intended control first, then verify with <code>get value</code>, <code>snapshot -i</code>, or another targeted check."),
  code(`pire-browser screenshot page.png
pire-browser screenshot --screenshot-dir ./shots page.png
pire-browser screenshot --screenshot-dir ./shots
pire-browser screenshot --screenshot-format jpeg --screenshot-quality 80 page.jpg
pire-browser screenshot --full page.png       # Scroll and stitch full page
pire-browser screenshot --annotate page.png   # Adds best-effort numbered visible-element overlays
pire-browser pdf page.pdf
pire-browser pdf viewport.pdf --viewport`),
  code(`pire-browser snapshot -i
pire-browser click '@e4'
pire-browser diff snapshot
pire-browser diff snapshot --baseline before.txt
pire-browser diff snapshot --selector "#main" --compact
pire-browser diff screenshot --baseline before.png
pire-browser diff screenshot --baseline before.png -o diff.png
pire-browser diff screenshot --baseline before.png -t 0.2
pire-browser diff url https://v1.example https://v2.example
pire-browser diff url https://v1.example https://v2.example --screenshot
pire-browser diff url https://v1.example https://v2.example --wait-until networkidle
pire-browser diff url https://v1.example https://v2.example --selector "#main" --compact`),

  h2("Read text", "read-text"),
  code(`pire-browser read
pire-browser read https://example.com/article
pire-browser read https://example.com/article --filter overview
pire-browser read https://example.com/article --outline
pire-browser read https://docs.example.com --llms index --filter auth
pire-browser read https://docs.example.com --llms full --filter auth
pire-browser read --llms index --filter auth
pire-browser read --require-md
pire-browser read example.com/article --require-md
pire-browser read https://example.com/article --json`),
  p("<code>read &lt;url&gt;</code> fetches markdown, plain text, or HTML directly from the CLI without launching Firefox. Omit the URL to read rendered text from the active Firefox tab, including client-side state and authenticated content. When <code>--llms</code>, <code>--require-md</code>, <code>--raw</code>, or <code>--timeout</code> is used without a URL, <code>pire-browser</code> first reads the active tab URL and then performs the same guarded no-browser URL fetch. Use <code>read</code> for documents and articles; use <code>snapshot -i</code> when you need interaction refs."),

  h2("Get info", "get-info"),
  code(`pire-browser get text <sel>          # Get text content
pire-browser get html <sel>          # Get innerHTML
pire-browser get value <sel>         # Get input value
pire-browser get attr <sel> <attr>   # Get attribute
pire-browser get title               # Get page title
pire-browser get url                 # Get current URL
pire-browser get count <sel>         # Count matching elements
pire-browser get box <sel>           # Get bounding box
pire-browser get styles <sel>        # Get computed styles`),

  h2("Check state", "check-state"),
  code(`pire-browser is visible <sel>        # Check if visible
pire-browser is enabled <sel>        # Check if enabled
pire-browser is checked <sel>        # Check if checked`),

  h2("Find elements", "find-elements"),
  p("Semantic locators can return a match or perform a supported action in the same command."),
  code(`pire-browser find role <role> [action] [value]
pire-browser find role <role> --name <name> [action] [value]
pire-browser find text <text> [action]
pire-browser find label <label> [action] [value]
pire-browser find placeholder <ph> [action] [value]
pire-browser find alt <text> [action]
pire-browser find title <text> [action]
pire-browser find testid <id> [action]
pire-browser find first <sel> [action] [value]
pire-browser find last <sel> [action] [value]
pire-browser find nth <n> <sel> [action] [value]`),
  code(`pire-browser find role button --name "Submit" click
pire-browser find label "Email" fill "test@example.com"
pire-browser find alt "pire-browser Logo" click
pire-browser find first ".item" text
pire-browser find nth 2 ".card" hover`),

  h2("Wait", "wait"),
  code(`pire-browser wait 1000
pire-browser wait --selector "#done" --timeout 5000
pire-browser wait --text "Saved"
pire-browser wait --url "**/dashboard"
pire-browser wait --fn "window.appReady === true"
pire-browser wait --download out.txt --timeout 60000
pire-browser wait --download --timeout 60000`),
  p("<code>wait --fn &lt;expression&gt;</code> polls a page-world JavaScript expression until it is truthy. Prefer short, side-effect-free predicates, then re-run <code>snapshot -i</code> before acting on refs."),

  h2("Downloads", "downloads"),
  code(`pire-browser --download-path ./downloads open <url>
pire-browser download <sel> <path> [--timeout <ms>]
pire-browser wait --download [path] [--timeout <ms>]`),
  p("Downloads are staged under local app data before being finalized to the requested path. Use <code>--download-path &lt;dir&gt;</code>, <code>PIRE_BROWSER_DOWNLOAD_PATH</code>, or <code>AGENT_BROWSER_DOWNLOAD_PATH</code> to set the Firefox download directory for newly launched managed sessions. With no explicit output path, <code>wait --download</code> reports the completed Firefox file path. Unknown MIME/helper-app dialogs can still time out in Firefox."),

  h2("Mouse", "mouse"),
  statusNote("mouseAndDrag"),
  code(`pire-browser hover <sel>             # Element hover is available
pire-browser click <sel>             # Element click is available
pire-browser tap <sel>               # Best-effort tap alias for click
pire-browser dblclick <sel>          # Element double-click is available
pire-browser mouse move 80 80        # Dispatch page mousemove at viewport coords
pire-browser mouse down
pire-browser mouse up
pire-browser mouse wheel 400
pire-browser swipe up 500            # Best-effort touch-direction page scroll
pire-browser drag '@e1' '@e2'        # Same-frame page-level drag/drop events`),

  h2("Clipboard", "clipboard"),
  code(`pire-browser clipboard read
pire-browser clipboard write "Hello, World!"
pire-browser clipboard copy
pire-browser clipboard paste`),
  p("<code>copy</code> and <code>paste</code> use the active page selection or focused editable element and return best-effort warnings because native Ctrl+C/Ctrl+V handlers are not run."),

  h2("Settings", "settings"),
  statusNote("settings"),
  code(`pire-browser --headed open https://example.com          # Legacy launch input
pire-browser --color-scheme dark open https://example.com
pire-browser --proxy http://proxy.example:8080 open https://example.com
pire-browser --proxy http://proxy.example:8080 --proxy-bypass "localhost,*.internal" open https://example.com
pire-browser set media light
pire-browser set viewport 1280 720
pire-browser device "iPhone 14"
pire-browser set device "iPhone 14"
pire-browser set geo 37.7749 -122.4194
pire-browser set headers '{"X-Custom-Header":"value"}'
pire-browser set credentials user pass
pire-browser set offline on
pire-browser set offline off
pire-browser open https://api.example.com --headers '{"Authorization":"Bearer token"}'
pire-browser --executable-path /path/to/firefox open https://example.com
# device/set device is best-effort viewport-only. set offline is best-effort request blocking.
# set credentials is memory-only HTTP Basic auth for the active origin.
# set geo is a page-level navigator.geolocation shim; TLS-ignore launch flags are not available
# --proxy is extension-applied for bridge commands; prefer --proxy ... open <url>`),
  code(`pire-browser launch --profile Default
pire-browser launch --url https://example.com
PIRE_BROWSER_FIREFOX_PATH=/path/to/firefox pire-browser launch
PIRE_BROWSER_EXTENSION_MODE=xpi pire-browser launch`),
  p("For lower-level launch, <code>--profile</code> is a command option after <code>launch</code>: use <code>pire-browser launch --profile Work</code>. For normal agent workflows, prefer <code>pire-browser --profile Work open &lt;url&gt;</code> or <code>pire-browser open &lt;url&gt;</code>."),

  h2("Cookies & storage", "cookies-storage"),
  code(`pire-browser cookies
pire-browser cookies set <name> <value>
pire-browser cookies set --curl ./cookies.curl --domain localhost
pire-browser cookies clear
pire-browser storage local
pire-browser storage local <key>
pire-browser storage local set <key> <value>
pire-browser storage local clear
pire-browser storage session`),
  p("<code>cookies set --curl</code> imports cookies from a Copy-as-cURL dump, JSON cookie array, object with a <code>cookies</code> array, or bare <code>Cookie:</code> header. Use <code>--domain</code> when staging cookies before navigating from an empty tab. Import commands report counts instead of echoing cookie values."),

  h2("Network", "network"),
  statusNote("networkControls"),
  code(`pire-browser --allowed-domains "example.com,*.example.com" open https://example.com
PIRE_BROWSER_ALLOWED_DOMAINS="example.com" pire-browser snapshot -i
pire-browser --proxy http://proxy.example:8080 open https://example.com
pire-browser --proxy socks5://proxy.example:1080 --proxy-bypass "localhost,*.internal" open https://example.com
pire-browser open https://api.example.com --headers '{"Authorization":"Bearer token"}'
pire-browser set headers '{"X-Custom-Header":"value"}'
pire-browser set credentials user pass
pire-browser set offline on
pire-browser wait --load networkidle
pire-browser network requests
pire-browser network requests --filter /api/
pire-browser network request <requestId>
pire-browser network har start
pire-browser network har stop network.har
pire-browser network har
pire-browser network har network.har --filter /api/
pire-browser network route "**/api/config**" --body '{"ready":true}'
pire-browser network route "*" --abort --resource-type script
pire-browser network unroute "*"
pire-browser network requests --clear`),
  p("The current network-related surface is cooperative domain allowlists, extension-applied proxy settings, origin-scoped request headers, active-tab network-idle waiting, recent request diagnostics with redacted request/response headers, agent-browser-style metadata HAR start/stop, direct HAR export, and best-effort active-tab route interception for mocks or aborts. Full CDP-style response control plus response body and raw cookie inspection remain outside the current Firefox runtime."),

  h2("Tabs & frames", "tabs-frames"),
  code(`pire-browser tab list
pire-browser tab new [url] [--label <name>]
pire-browser tab select <tN-or-label>
pire-browser tab close <tN-or-label>
pire-browser tab label <tN> <label>
pire-browser window new
pire-browser frame <sel>
pire-browser frame '@e3'
pire-browser frame payment-frame
pire-browser frame https://checkout.example/frame
pire-browser frame main`),
  h3("Stable tab ids and labels", "stable-tab-ids-and-labels"),
  code(`pire-browser tab new --label docs https://docs.example.com
pire-browser tab docs
pire-browser snapshot -i
pire-browser click '@e3'
pire-browser tab close docs`),
  h3("Iframe support", "iframe-support"),
  code(`pire-browser snapshot -i
# @e3 [Iframe] "payment-frame"
#   @e4 [input] "Card number"
#   @e5 [button] "Pay"
pire-browser fill '@e4' "4111111111111111"
pire-browser click '@e5'

pire-browser frame '@e3'
pire-browser snapshot -i
pire-browser frame main`),
  p("Refs inside iframes carry frame context, so direct actions such as <code>fill '@e4'</code> and <code>click '@e5'</code> usually work without switching first. Use <code>frame &lt;ref|selector|name|url&gt;</code> for scoped snapshots or selector-based actions inside one iframe, then <code>frame main</code> before returning to outer-page selectors."),

  h2("Dialogs", "dialogs"),
  statusNote("dialogs"),
  code(`pire-browser dialog status
pire-browser dialog accept [text]
pire-browser dialog dismiss
pire-browser snapshot -i`),
  p("Dialog support is Firefox WebExtension mediated. <code>alert</code>, <code>confirm</code>, and <code>prompt</code> are shimmed in the page context so they do not hard-block the agent loop. <code>dialog accept [text]</code> configures the next shimmed confirm or prompt to accept, using text as the prompt return value; <code>dialog dismiss</code> configures the next shimmed confirm or prompt to cancel. Observed dialogs surface as <code>PAGE_DIALOG</code> warnings. Re-run <code>snapshot -i</code> after handling a dialog before acting on refs."),

  h2("Streaming", "streaming"),
  code(`# Dashboard-backed live read-only preview.
pire-browser stream enable
pire-browser stream status
pire-browser stream disable

# Full WebSocket viewport streaming is not available in the current Firefox backend.
# Use record start/stop when a screenshot-sequence evidence bundle is enough.`, "bash"),
  p("<code>stream enable</code> starts the dashboard-backed preview service in the background. <code>stream status --json</code> reports <code>transport: \"dashboard-http-polling\"</code>, <code>liveViewportKind: \"polling-screenshot-preview\"</code>, and <code>webSocketStreaming: false</code>."),

  h2("Debug", "debug"),
  statusNote("debugging"),
  code(`pire-browser console
pire-browser console --json
pire-browser console --clear
pire-browser errors
pire-browser errors --clear
pire-browser highlight <sel>
pire-browser trace start
pire-browser trace status
pire-browser trace stop trace.json
pire-browser profiler start
pire-browser profiler status
pire-browser profiler stop profile.json
pire-browser record start
pire-browser record status
pire-browser record stop recording-dir`),
  p("Console, errors, highlight, trace bundles, profiler bundles, stream preview controls, and screenshot-sequence recordings are active-tab Firefox diagnostics. <code>trace start</code> / <code>trace stop</code> writes a Firefox QA evidence bundle with console, page-error, network/HAR metadata, vitals, compact snapshot, and screenshot evidence. <code>profiler start</code> / <code>profiler stop</code> writes Chrome Trace Event-shaped JSON from Firefox Performance Timeline entries. <code>record start</code> / <code>record stop</code> writes bounded visible-viewport PNG frames plus <code>recording.json</code>. These are not Chrome DevTools CPU profiles, native WebM video, or full WebSocket live viewport streams."),

  h2("Auth vault", "auth-vault"),
  statusNote("auth"),
  code(`pire-browser auth save app --url https://example.com/login --username user --password pass --username-selector "#email" --password-selector "#password" --submit-selector "button[type=submit]"
echo "pass" | pire-browser auth save app --url https://example.com/login --username user --password-stdin
pire-browser auth login app
pire-browser auth login app --credential-provider vault --item "My App" --url https://example.com/login
pire-browser --confirm-actions plugin:vault:credential.read auth login app --credential-provider vault --item "My App"
pire-browser auth list
pire-browser auth show app
pire-browser auth delete app
# set credentials covers session-only HTTP Basic auth.
# --password-stdin avoids putting saved auth passwords in shell history.
# Auth profiles are stored in the encrypted local auth vault.
# Credential providers use configured agent-browser-compatible plugins with capability credential.read`),

  h2("Confirmation", "confirmation"),
  code(`pire-browser --confirm-actions eval eval "document.title"
pire-browser confirm <confirmation-id>
pire-browser deny <confirmation-id>
PIRE_BROWSER_CONFIRM_ACTIONS=eval pire-browser eval "document.title"`),
  code(`pire-browser --confirm-actions eval,download eval "document.title"
# Returns confirmation_required with ID
pire-browser confirm c_8f3a1234`),

  h2("State management", "state-management"),
  statusNote("activeOriginState"),
  code(`pire-browser state save ./.pire-state/example.com-review.json
pire-browser state load ./.pire-state/example.com-review.json
pire-browser state list --json
pire-browser state show example.com-review --json
pire-browser state rename example.com-review example.com-ready
pire-browser state clear example.com-ready
pire-browser state clear --all
pire-browser state clean --older-than 7
pire-browser state inspect ./.pire-state/example.com-review.json
pire-browser state inspect --record ./.pire-state/example.com-review.json
pire-browser state load --require-inspected ./.pire-state/example.com-review.json
pire-browser state load --no-require-inspected ./.pire-state/example.com-review.json`),
  code(`PIRE_BROWSER_REQUIRE_INSPECTED_STATE=1 pire-browser state load ./.pire-state/app.json
PIRE_BROWSER_ENCRYPTION_KEY=<64-hex-key> pire-browser state save ./.pire-state/app-work.json
AGENT_BROWSER_ENCRYPTION_KEY=<64-hex-key> pire-browser state load ./.pire-state/app-work.json
pire-browser --auto-connect state save ./.pire-state/app-work.json
pire-browser --state ./.pire-state/app-work.json open https://example.com/dashboard
pire-browser --session-name work state save ./.pire-state/app-work.json
pire-browser --session-name review state load --require-inspected ./.pire-state/app-work.json`),
  p("State files contain active-origin cookies, localStorage, and sessionStorage. They are plaintext by default for compatibility. Set <code>PIRE_BROWSER_ENCRYPTION_KEY</code> or the agent-browser-compatible <code>AGENT_BROWSER_ENCRYPTION_KEY</code> to a 64-character hex AES-256 key to write/load AES-256-GCM encrypted state files. <code>state list</code>, <code>state show</code>, and <code>state inspect</code> are metadata-only and do not print cookie or storage values. State files do not include saved passwords, full browser profiles, service workers, IndexedDB, or cross-origin SSO state."),

  h2("Sessions", "sessions"),
  statusNote("namedSessions"),
  code(`pire-browser session list
pire-browser session list --json
pire-browser session attach <session-id>
pire-browser session cleanup
pire-browser --session <uuid> snapshot -i
pire-browser --session work open https://example.com
pire-browser --session-name work open https://example.com
pire-browser --profile Work open https://example.com
PIRE_BROWSER_PROFILE=Work pire-browser snapshot -i
pire-browser --session-name work close`),

  h2("Managed Firefox profiles", "managed-firefox-profiles"),
  statusNote("managedProfiles"),
  code(`pire-browser profiles --json
pire-browser profiles import /path/to/firefox-profile --name Work
pire-browser profiles import /path/to/firefox-profile --name Work --overwrite
pire-browser launch --profile Default
pire-browser --profile Work open https://example.com
pire-browser --profile ~/.myapp-profile open https://example.com
# Import copies a Firefox profile into managed pire-browser state.
# Chrome profile import/reuse is not part of the Firefox backend.`),

  h2("Dashboard", "dashboard"),
  statusNote("dashboard"),
  code(`pire-browser dashboard
pire-browser dashboard start
pire-browser dashboard start --background
pire-browser dashboard start --port 4848
pire-browser dashboard start --port 0 --json
pire-browser dashboard status --json
pire-browser dashboard stop
pire-browser activity list --json`),
  p("Starts a localhost status dashboard. It shows install health, live sessions, managed profiles, a live read-only polling viewport preview, optional AI Gateway chat, recent redacted command activity, and capability notes. Without <code>--background</code>, press <code>Ctrl+C</code> in the terminal to stop it. With <code>--background</code>, use <code>dashboard status</code> and <code>dashboard stop</code>. The chat panel uses the same bounded command loop as <code>pire-browser chat</code> when <code>AI_GATEWAY_API_KEY</code> is set, but does not stream responses yet. WebSocket viewport streaming is still not available in the Firefox backend; use <code>record start</code> / <code>record stop</code> for screenshot-sequence evidence."),

  h2("Doctor", "doctor"),
  code(`pire-browser doctor
pire-browser doctor --fix
pire-browser doctor --fix --with-deps
pire-browser doctor --fix --firefox-path /path/to/firefox
pire-browser doctor --offline --quick
pire-browser doctor --json
pire-browser install-status --json`),
  p("Exit code is <code>0</code> when checks pass or report only advisory warnings, and nonzero when setup is missing or arguments are invalid. Plain doctor is read-only; <code>doctor --json</code> and <code>install-status --json</code> include <code>nextActions</code> with concrete repair commands, while <code>doctor --fix</code> explicitly reruns native host setup and exits nonzero if the follow-up status still needs attention. <code>doctor --fix --with-deps</code> accepts agent-browser-style repair recipes; it can install Firefox through winget/Chocolatey on Windows or Homebrew on macOS when Firefox is missing, and reports guided non-Snap/non-Flatpak Firefox steps on Linux."),

  h2("Chat", "chat"),
  statusNote("chat"),
  code(`AI_GATEWAY_API_KEY=... pire-browser chat "open example.com and summarize it"
pire-browser -q chat "summarize this page"
pire-browser -v chat "fill the search box with cats and press Enter"
pire-browser --model anthropic/claude-sonnet-4.6 chat "take a screenshot"
pire-browser chat --max-steps 8
pire-browser chat`),
  p("<code>chat</code> is an agent-browser-style natural-language loop backed by Vercel AI Gateway. The model returns JSON command plans, pire-browser executes those commands through the normal CLI path, and observations are sent back until the model returns a final answer or the bounded step limit is reached. Bare <code>chat</code> starts a small terminal REPL; type <code>quit</code> to exit. Set <code>AI_GATEWAY_API_KEY</code>; optional <code>AI_GATEWAY_MODEL</code> and <code>AI_GATEWAY_URL</code> override the defaults. The dashboard AI Chat panel uses this same loop and forwards the currently previewed session when one exists."),

  h2("MCP", "mcp"),
  statusNote("mcp"),
  code(`pire-browser mcp
pire-browser mcp --tools core
pire-browser mcp --tools core,network
pire-browser mcp --tools core,state
pire-browser mcp --tools all`),
  p("The stdio MCP server exposes typed tools through profiles. Start with <code>core</code> for the inspect-before-act workflow, add comma-separated profiles such as <code>network</code>, <code>state</code>, <code>debug</code>, <code>tabs</code>, or <code>mobile</code> when needed, and use <code>all</code> only when the host can tolerate the full tool surface. Use debug-profile <code>pire_browser_install</code> only for explicit native-host setup or repair, and <code>pire_browser_upgrade</code> only for user-requested package update."),

  h2("Navigation", "navigation"),
  code(`pire-browser back
pire-browser forward
pire-browser reload
pire-browser open https://example.com
pire-browser goto https://example.com
pire-browser navigate https://example.com`),

  h2("Pre-navigation setup", "pre-navigation-setup"),
  code(`pire-browser launch
pire-browser --session-name review open about:blank
pire-browser --session-name review state load ./.pire-state/app.json
pire-browser --session-name review open https://app.example.com/dashboard`),

  h2("React / Web Vitals", "react-web-vitals"),
  code(`pire-browser open --enable react-devtools https://app.example.com
pire-browser react tree
pire-browser react tree --selector "#root" --depth 3
pire-browser react inspect r1
pire-browser react inspect '@e1'
pire-browser react renders start
pire-browser react renders stop
pire-browser react suspense
pire-browser react suspense --only-dynamic
pire-browser vitals
pire-browser vitals https://app.example.com/dashboard
pire-browser vitals --json
pire-browser snapshot -i
pire-browser get text <sel>
pire-browser screenshot page.png`),

  h2("Init scripts", "init-scripts"),
  statusNote("initScripts"),
  code(`pire-browser open --init-script ./before-load.js https://example.com
pire-browser addinitscript "window.__flag = true"
pire-browser removeinitscript init1`),

  h2("Global options", "global-options"),
  code(`--config <path>                 # Load an explicit pire-browser config file
--session <uuid>              # Target an existing live session id
--session <name>              # Reuse or launch a named managed Firefox profile
--session-name <name>         # Explicit named Firefox profile spelling
--profile <name-or-path>      # Managed Firefox profile alias
--state <path>                # Preload active-origin state before a browser command
--auto-connect                # Select a live managed session when saving state
--allowed-domains <list>      # Cooperative domain allowlist
--action-policy <path>        # Action policy JSON
--confirm-actions <list>      # Categories that require confirmation
--confirm-interactive         # TTY confirmation prompt
--executable-path <path>      # Custom Firefox executable
--color-scheme <mode>         # dark, light, or auto page color-scheme override
--json                        # Structured output where supported
--debug                       # Extra diagnostic output`),

  h2("Batch execution", "batch-execution"),
  code(`pire-browser batch "open https://example.com" "snapshot -i" "screenshot page.png"
pire-browser batch --bail "open https://example.com" "click '@e1'"`),
  code(`echo '[
  ["open", "https://example.com"],
  ["snapshot", "-i"],
  ["click", "@e1"],
  ["screenshot", "result.png"]
]' | pire-browser batch --json`),
  p("When using MCP, add the <code>debug</code> profile and call <code>pire_browser_batch</code> with a typed <code>commands</code> array for short sequences. Use individual typed tools when an agent needs to read intermediate output before choosing the next action."),

  h2("Command chaining", "command-chaining"),
  code(`pire-browser open https://example.com && pire-browser wait --selector "#main" && pire-browser snapshot -i
pire-browser fill '@e1' "user@example.com" && pire-browser fill '@e2' "pass" && pire-browser click '@e3'
pire-browser open https://example.com && pire-browser screenshot page.png`),

  h2("Local files", "local-files"),
  code(`pire-browser open file:///path/to/page.html
pire-browser screenshot output.png
pire-browser upload '#file' ./fixture.txt`),
  p("Local file behavior depends on Firefox permissions and extension context. Use HTTP fixture servers for repeatable agent tests when possible."),
];

export default page({
  path: "/commands/",
  title: "Commands",
  description: "pire-browser CLI command reference.",
  blocks: commandsBlocks,
});
