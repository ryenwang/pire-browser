import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const quickStartBlocks = [
  h2("Before first command", "before-first-command"),
  code(`npm install -g pire-browser
pire-browser install`),
  p("Run setup once after installing. It is safe to run again. If this fails, use the Installation page's first-run repair section. For Pi, use <code>pi install npm:pire-browser</code> and then ask the agent to use the tool. For a one-off trial without global install, use <code>npx -y pire-browser@latest open https://example.com</code>, then <code>npx -y pire-browser@latest snapshot -i</code>."),
  h2("Core workflow", "core-workflow"),
  p("Every browser automation follows this pattern:"),
  code(`# 1. Navigate
pire-browser open https://example.com

# 2. Snapshot to get element refs
pire-browser snapshot -i
# Output:
# @e1 [heading] "Example Domain"
# @e2 [link] "More information..."

# 3. Interact using refs
pire-browser click '@e2'

# 4. Re-snapshot after page changes
pire-browser snapshot -i`),
  p("If a click reports that the target is covered by another element, dismiss or interact with the reported covering element, then run <code>snapshot -i</code> before retrying the original ref."),
  h2("MCP-first agents", "mcp-first-agents"),
  p("When an agent host supports MCP, start the typed core profile and keep the same inspect-before-act loop in tool calls."),
  code(`pire-browser mcp --tools core

# MCP client config:
# {
#   "mcpServers": {
#     "pire-browser": {
#       "command": "pire-browser",
#       "args": ["mcp", "--tools", "core"]
#     }
#   }
# }

# MCP tool loop:
# 1. pire_browser_open({ "url": "https://example.com" })
# 2. pire_browser_snapshot({ "interactive": true })
# 3. pire_browser_click({ "selector": "@e2" })
# 4. pire_browser_wait_for_load({ "state": "networkidle" })
# 5. pire_browser_snapshot({ "interactive": true })`),
  p("Use <code>pire_browser_get_text</code>, <code>pire_browser_get_url</code>, <code>pire_browser_is_visible</code>, and the other typed get/check tools for targeted verification before reporting success. Start with <code>--tools core</code>; add <code>network</code>, <code>state</code>, <code>tabs</code>, <code>debug</code>, <code>mobile</code>, or <code>react</code> only when that workflow needs the extra tools. If the native package is missing, <code>pire-browser mcp --help</code> still prints startup and repair guidance from the launcher."),
  h2("Project QA sessions", "project-qa-sessions"),
  code(`SESSION="$(pire-browser session id --scope worktree --prefix my-app)"
pire-browser --session "$SESSION" --restore open http://localhost:3000
pire-browser --session "$SESSION" --restore snapshot -i`),
  p("Use one worktree-scoped session with <code>--restore</code> for a local app QA loop so cookies, tabs, and managed Firefox profile state stay isolated to that project. In pire-browser, named Firefox profiles provide the persistence store."),
  h2("Common commands", "common-commands"),
  code(`pire-browser open                         # Launch/reuse Firefox without navigating
pire-browser open https://example.com
pire-browser read https://example.com/docs   # Read docs/articles without launching Firefox
pire-browser read                            # Read rendered text from the active tab
pire-browser snapshot -i                 # Get interactive elements with refs
pire-browser click '@e2'                 # Click by ref
pire-browser click '@link-ref' --new-tab # Open a link target in a new tab
pire-browser fill '@e3' "test@example.com" # Fill input by ref
pire-browser press Enter                 # Press a key at current focus
pire-browser keyboard type "hello"       # Type at current focus
pire-browser get text '@e1'              # Get text content
pire-browser is visible '@e1'            # Check element state
pire-browser screenshot                  # Save to generated path
pire-browser screenshot page.png         # Save to specific path; hides scrollbars
pire-browser close`),
  p("Screenshots hide native scrollbars by default for stable visual evidence. Use <code>pire-browser screenshot --hide-scrollbars false page.png</code> when scrollbar presence matters."),
  h2("Traditional selectors", "traditional-selectors"),
  p("CSS selectors and semantic locators also work:"),
  code(`pire-browser click "#submit"
pire-browser fill "input[name=email]" "hello@example.com"
pire-browser find role button --name "Submit" click`),
  p("<code>keyboard type</code>, <code>keyboard inserttext</code>, <code>keydown</code>, and <code>keyup</code> use the current page focus. Click or focus the target first, then verify the page state."),
  h2("Headed and headless mode", "headed-headless-mode"),
  code(`pire-browser --headed open https://example.com
pire-browser --headless open https://example.com
PIRE_BROWSER_HEADLESS=1 pire-browser open https://example.com`),
  p("The Firefox backend launches visible managed sessions through the package-local <code>web-ext</code> helper by default. Use <code>--headless</code>, <code>PIRE_BROWSER_HEADLESS=1</code>, <code>AGENT_BROWSER_HEADLESS=1</code>, or <code>headless: true</code> in config when a CI command should start a new headless managed session. Existing live sessions keep their current mode."),
  h2("Launch context", "launch-context"),
  code(`pire-browser --args "-private-window" open https://example.com
pire-browser --user-agent "qa-bot/1.0" open https://example.com`),
  p("Use <code>--args</code> for comma- or newline-separated Firefox launch arguments and <code>--user-agent</code> for a Firefox User-Agent override. These apply when a command launches a new managed Firefox session; existing live sessions keep their current launch context."),
  h2("Wait for content", "wait-for-content"),
  code(`pire-browser wait '@e1'                  # Wait for element
pire-browser wait --load networkidle    # Wait for active-tab network idle
pire-browser wait --url "**/dashboard"  # Wait for URL pattern
pire-browser wait --fn "window.appReady === true"
pire-browser wait 2000                  # Wait milliseconds`),
  h2("Command chaining", "command-chaining"),
  code(`pire-browser open https://example.com && pire-browser wait --selector "#main" && pire-browser snapshot -i
pire-browser fill '@e1' "user@example.com" && pire-browser fill '@e2' "pass" && pire-browser click '@e3'
pire-browser open https://example.com && pire-browser screenshot page.png`),
  p("Use <code>&&</code> when you do not need intermediate output. Run commands separately when you need to parse output first, such as snapshot refs before interacting."),
  h2("JSON output", "json-output"),
  code(`pire-browser snapshot -i --json
pire-browser get text '@e1' --json`),
  p("The default text output is more compact and preferred for AI agents."),
];

export default page({
  path: "/quick-start/",
  title: "Quick Start",
  description: "The shortest working pire-browser workflow.",
  blocks: quickStartBlocks,
});
