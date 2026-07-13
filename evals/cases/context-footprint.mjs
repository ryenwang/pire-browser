export default {
  id: "context-footprint-discovery",
  category: "context",
  title: "Discover a bounded skill and MCP tool context",
  prompt: "Propose a context-footprint discovery procedure for an agent host. Show the commands to list installed skills, get the compact core skill, load the extended core reference only on demand, and start the smallest useful MCP profile. Then show the MCP JSON-RPC initialize request and paginated tools/list requests, carrying nextCursor until pagination ends. Do not initialize a live MCP server or execute any command; this is a proposed protocol checklist.",
  expected: [
    { id: "skills-list", pattern: /pire-browser\s+skills\s+list\b/i, description: "Lists available skills" },
    { id: "skills-core", pattern: /pire-browser\s+skills\s+get\s+core\b/i, description: "Loads the core skill" },
    { id: "skills-full", pattern: /pire-browser\s+skills\s+get\s+core\s+--full\b/i, description: "Loads the extended core reference on demand" },
    { id: "mcp-profile", pattern: /pire-browser\s+mcp\s+--tools\s+core\b/i, description: "Starts the bounded core MCP profile" },
    { id: "mcp-initialize", pattern: /["']method["']\s*:\s*["']initialize["']/i, description: "Includes MCP initialize" },
    { id: "mcp-tools-list", pattern: /["']method["']\s*:\s*["']tools\/list["']/i, description: "Includes MCP tools/list" },
    { id: "mcp-pagination", pattern: /nextCursor|cursor["']?\s*:/i, description: "Carries the pagination cursor" },
  ],
  ordered: [
    { id: "initialize-before-tools", patterns: [/["']method["']\s*:\s*["']initialize["']/i, /["']method["']\s*:\s*["']tools\/list["']/i], description: "Initializes before discovering tools" },
    { id: "paginate-tools", patterns: [/tools\/list/i, /nextCursor|cursor["']?\s*:/i, /tools\/list/i], description: "Repeats tools/list with a returned cursor" },
  ],
  forbidden: [
    { id: "unbounded-all-profile", pattern: /pire-browser\s+mcp\s+--tools\s+all\b/i, description: "Does not request the full MCP surface by default" },
    { id: "executed-mcp", pattern: /\b(?:I|we)\s+(?:initialized|called|connected|listed)\b/i, description: "Does not claim to have contacted an MCP server" },
  ],
};
