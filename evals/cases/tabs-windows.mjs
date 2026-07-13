export default {
  id: "tabs-and-windows",
  category: "workflow",
  title: "Inspect and switch tabs and windows without losing context",
  prompt: "Propose a workflow for an OAuth or checkout flow that opens both a new tab and a separate popup window. List the current tabs, create or identify the new tab, inspect it, list or create windows, switch to the popup by id, verify it with a fresh snapshot, then switch back and close only the temporary target. Use exact pire-browser CLI commands and explain how you avoid assuming that a tab id is a window id.",
  expected: [
    { id: "tab-list", pattern: /pire-browser\s+(?:tab|tabs)(?:\s+list)?\b/i, description: "Lists tabs before switching" },
    { id: "tab-create-or-open", pattern: /pire-browser\s+(?:tab\s+new|open\s+\S+\s+--new-tab|click\s+\S+\s+--new-tab)/i, description: "Creates or identifies a new tab" },
    { id: "window-list-or-new", pattern: /pire-browser\s+window(?:\s+(?:list|new))?\b/i, description: "Uses the window command family" },
    { id: "window-switch", pattern: /pire-browser\s+window\s+switch\s+\S+/i, description: "Switches to a specific window" },
    { id: "fresh-tab-verification", pattern: /pire-browser\s+snapshot\b/i, description: "Verifies the switched context" },
  ],
  ordered: [
    { id: "switch-then-verify", patterns: [/pire-browser\s+(?:tab|window)\s+(?:switch|new)\b/i, /pire-browser\s+snapshot\b/i], description: "Takes a fresh snapshot after context switching" },
  ],
  forbidden: [
    { id: "tab-window-confusion", pattern: /(?:tab|tabs)\s+(?:id|target)\s+(?:is|equals)\s+(?:the\s+)?window/i, description: "Does not conflate tab and window identifiers" },
    { id: "close-all-contexts", pattern: /pire-browser\s+(?:close\s+--all|window\s+close\s+--all)/i, description: "Does not close unrelated contexts" },
    { id: "executed-action", pattern: /\b(?:I|we)\s+(?:opened|switched|closed|clicked)\b/i, description: "Does not claim to have operated the browser" },
  ],
};
