import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const commandsBlocks = [
  h2("Core", "core"),
  code(`pire-browser open                    # Launch managed Firefox if needed
pire-browser open <url>              # Navigate to a URL
pire-browser goto <url>              # Alias for navigation
pire-browser navigate <url>          # Alias for navigation
pire-browser read [url]              # Agent-friendly text; URL reads do not launch Firefox
pire-browser click <sel>             # Click ref or selector
pire-browser fill <sel> <text>       # Clear and fill
pire-browser type <sel> <text>       # Type into element
pire-browser press <key>             # Press key such as Enter or Tab
pire-browser hover <sel>             # Hover element
pire-browser focus <sel>             # Focus element
pire-browser select <sel> <value>    # Select dropdown option
pire-browser check <sel>             # Check checkbox
pire-browser uncheck <sel>           # Uncheck checkbox
pire-browser scroll <dir> [px]       # Scroll page or container
pire-browser scrollintoview <sel>    # Scroll element into view
pire-browser upload <sel> <files>    # Assign local file input payloads
pire-browser screenshot [path]       # Capture screenshot evidence
pire-browser pdf page.pdf            # Capture image-backed PDF evidence
pire-browser snapshot -i             # Accessibility tree with refs
pire-browser eval <js>               # Run JavaScript with policy checks
pire-browser close                   # Close targeted session`),
  p("Refs must usually be quoted in PowerShell, for example <code>pire-browser click '@e2'</code>. Re-run <code>snapshot -i</code> after navigation, DOM changes, dialogs, downloads, or failed actions."),
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
pire-browser read example.com/article --require-md
pire-browser read https://example.com/article --json`),
  p("<code>read &lt;url&gt;</code> fetches markdown, plain text, or HTML directly from the CLI without launching Firefox. Omit the URL to read rendered text from the active Firefox tab, including client-side state and authenticated content. Use <code>read</code> for documents and articles; use <code>snapshot -i</code> when you need interaction refs."),

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
pire-browser wait --download out.txt --timeout 60000`),
  p("<code>wait --fn &lt;expression&gt;</code> polls a page-world JavaScript expression until it is truthy. Prefer short, side-effect-free predicates, then re-run <code>snapshot -i</code> before acting on refs."),

  h2("Downloads", "downloads"),
  code(`pire-browser download <sel> <path> [--timeout <ms>]
pire-browser wait --download [path] [--timeout <ms>]`),
  p("Downloads are staged under local app data before being finalized to the requested path. Unknown MIME/helper-app dialogs can still time out in Firefox."),

  h2("Mouse", "mouse"),
  statusNote("mouseAndDrag"),
  code(`pire-browser hover <sel>             # Element hover is available
pire-browser click <sel>             # Element click is available
pire-browser mouse move 80 80        # Dispatch page mousemove at viewport coords
pire-browser mouse down
pire-browser mouse up
pire-browser mouse wheel 400
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
pire-browser set device "iPhone 14"
pire-browser set geo 37.7749 -122.4194
pire-browser set headers '{"X-Custom-Header":"value"}'
pire-browser set credentials user pass
pire-browser set offline on
pire-browser set offline off
pire-browser open https://api.example.com --headers '{"Authorization":"Bearer token"}'
pire-browser --executable-path /path/to/firefox open https://example.com
# set device is best-effort viewport-only. set offline is best-effort request blocking.
# set credentials is memory-only HTTP Basic auth for the active origin.
# set geo is a page-level navigator.geolocation shim; TLS-ignore launch flags are not available
# --proxy is extension-applied for bridge commands; prefer --proxy ... open <url>`),
  code(`pire-browser launch --profile Default
pire-browser launch --url https://example.com
PIRE_BROWSER_FIREFOX_PATH=/path/to/firefox pire-browser launch
PIRE_BROWSER_EXTENSION_MODE=xpi pire-browser launch`),

  h2("Cookies & storage", "cookies-storage"),
  code(`pire-browser cookies
pire-browser cookies set <name> <value>
pire-browser cookies clear
pire-browser storage local
pire-browser storage local <key>
pire-browser storage local set <key> <value>
pire-browser storage local clear
pire-browser storage session`),

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
  p("The current network-related surface is cooperative domain allowlists, extension-applied proxy settings, origin-scoped request headers, active-tab network-idle waiting, recent request diagnostics, agent-browser-style metadata HAR start/stop, direct HAR export, and best-effort active-tab route interception for mocks or aborts. Full CDP-style response control plus response body and raw-header inspection remain outside the current Firefox runtime."),

  h2("Tabs & frames", "tabs-frames"),
  code(`pire-browser tab list
pire-browser tab new [url] [--label <name>]
pire-browser tab select <tN-or-label>
pire-browser tab close <tN-or-label>
pire-browser tab label <tN> <label>
pire-browser window new
pire-browser frame <sel>
pire-browser frame '@e3'
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

  h2("Dialogs", "dialogs"),
  statusNote("dialogs"),
  code(`pire-browser dialog status
pire-browser dialog accept [text]
pire-browser dialog dismiss
pire-browser snapshot -i`),
  p("Dialog support is Firefox WebExtension mediated. <code>alert</code>, <code>confirm</code>, and <code>prompt</code> are shimmed in the page context so they do not hard-block the agent loop. <code>dialog accept [text]</code> configures the next shimmed confirm or prompt to accept, using text as the prompt return value; <code>dialog dismiss</code> configures the next shimmed confirm or prompt to cancel. Observed dialogs surface as <code>PAGE_DIALOG</code> warnings. Re-run <code>snapshot -i</code> after handling a dialog before acting on refs."),

  h2("Streaming", "streaming"),
  code(`# Streaming is not available in the current Firefox backend.
pire-browser stream status
# Runtime WebSocket viewport streaming is not available in the current Firefox backend.`, "bash", { notAvailable: true }),

  h2("Debug", "debug"),
  statusNote("debugging"),
  code(`pire-browser console
pire-browser console --json
pire-browser console --clear
pire-browser errors
pire-browser errors --clear
pire-browser highlight <sel>`),
  p("Console, errors, and highlight are active-tab Firefox diagnostics. Trace capture, profiler, video recording, and DevTools inspect proxy are not available yet."),

  h2("Auth vault", "auth-vault"),
  statusNote("auth"),
  code(`pire-browser auth save app --url https://example.com/login --username user --password pass --username-selector "#email" --password-selector "#password" --submit-selector "button[type=submit]"
echo "pass" | pire-browser auth save app --url https://example.com/login --username user --password-stdin
pire-browser auth login app
pire-browser auth list
pire-browser auth show app
pire-browser auth delete app
# set credentials covers session-only HTTP Basic auth.
# --password-stdin avoids putting saved auth passwords in shell history.
# Encrypted auth vault storage and credential-provider plugins are not available yet`),

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
pire-browser --auto-connect state save ./.pire-state/app-work.json
pire-browser --state ./.pire-state/app-work.json open https://example.com/dashboard
pire-browser --session-name work state save ./.pire-state/app-work.json
pire-browser --session-name review state load --require-inspected ./.pire-state/app-work.json`),
  p("State files are plaintext active-origin cookies, localStorage, and sessionStorage. <code>state show</code> and <code>state inspect</code> are metadata-only. State files do not include saved passwords, full browser profiles, service workers, IndexedDB, or cross-origin SSO state."),

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
pire-browser launch --profile Default
pire-browser --profile Work open https://example.com
pire-browser --profile ~/.myapp-profile open https://example.com
# Chrome profile import/reuse is not part of the Firefox backend.`),

  h2("Dashboard", "dashboard"),
  statusNote("dashboard"),
  code(`pire-browser dashboard
pire-browser dashboard start
pire-browser dashboard start --port 4848
pire-browser dashboard start --port 0 --json
pire-browser activity list --json`),
  p("Starts a foreground localhost status dashboard. It shows install health, live sessions, managed profiles, recent redacted command activity, and capability notes. Press <code>Ctrl+C</code> in the terminal to stop it. Live viewport streaming is still not available in the Firefox backend."),

  h2("Doctor", "doctor"),
  code(`pire-browser doctor
pire-browser doctor --offline --quick
pire-browser doctor --json
pire-browser install-status --json`),
  p("Exit code is <code>0</code> when checks pass or report only advisory warnings, and nonzero when setup is missing or arguments are invalid."),

  h2("Chat", "chat"),
  code(`# Natural-language chat is not implemented in pire-browser yet.
pire-browser skills cat core
pire-browser help commands`),

  h2("MCP", "mcp"),
  statusNote("mcp"),
  code(`pire-browser mcp
pire-browser mcp --tools core
pire-browser mcp --tools core,network
pire-browser mcp --tools core,state
pire-browser mcp --tools all`),
  p("The stdio MCP server exposes typed tools through profiles. Start with <code>core</code> for the inspect-before-act workflow, add comma-separated profiles such as <code>network</code>, <code>state</code>, <code>debug</code>, <code>tabs</code>, or <code>mobile</code> when needed, and use <code>all</code> only when the host can tolerate the full tool surface."),

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
  code(`pire-browser vitals
pire-browser vitals https://app.example.com/dashboard
pire-browser vitals --json
# React DevTools commands are not available yet.
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
