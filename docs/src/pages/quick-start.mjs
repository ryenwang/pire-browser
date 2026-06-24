import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const quickStartBlocks = [
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
  h2("Common commands", "common-commands"),
  code(`pire-browser open https://example.com
pire-browser read https://example.com/docs   # Read docs/articles without launching Firefox
pire-browser read                            # Read rendered text from the active tab
pire-browser snapshot -i                 # Get interactive elements with refs
pire-browser click '@e2'                 # Click by ref
pire-browser fill '@e3' "test@example.com" # Fill input by ref
pire-browser get text '@e1'              # Get text content
pire-browser is visible '@e1'            # Check element state
pire-browser screenshot                  # Save to generated path
pire-browser screenshot page.png         # Save to specific path
pire-browser close`),
  h2("Traditional selectors", "traditional-selectors"),
  p("CSS selectors and semantic locators also work:"),
  code(`pire-browser click "#submit"
pire-browser fill "input[name=email]" "hello@example.com"
pire-browser find role button --name "Submit" click`),
  h2("Headed mode", "headed-mode"),
  code(`pire-browser --headed open https://example.com`),
  p("The current Firefox backend launches a managed visible Firefox session through <code>web-ext</code>; <code>--headed</code> and <code>--headless</code> are accepted as legacy launch inputs."),
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
  h2("MCP", "mcp"),
  code(`pire-browser mcp --tools core`),
  p("Use the stdio MCP server when an agent host prefers typed tools instead of shell command strings. The MCP core profile exposes the same inspect-before-act workflow as the CLI."),
];

export default page({
  path: "/quick-start/",
  title: "Quick Start",
  description: "The shortest working pire-browser workflow.",
  blocks: quickStartBlocks,
});
