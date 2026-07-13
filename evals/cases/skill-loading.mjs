export default {
  id: "skill-loading-before-browser",
  category: "skill",
  title: "Load the installed skill before proposing browser commands",
  prompt: "Show the first-run setup for a task that will inspect a page and then click a result. The first browser-related command must load the installed core skill. After that, propose an open or navigate command, an accessibility snapshot, an action using a ref or selector, and a fresh snapshot for verification. Keep this as a proposal only.",
  expected: [
    { id: "load-core-skill", pattern: /pire-browser\s+skills\s+get\s+core\b/i, description: "Loads the version-matched core skill" },
    { id: "inspect-snapshot", pattern: /pire-browser\s+snapshot\b/i, description: "Inspects the page before acting" },
    { id: "browser-command", pattern: /pire-browser\s+(?:open|navigate)\b/i, description: "Uses a concrete navigation command" },
  ],
  ordered: [
    { id: "skill-before-browser", patterns: [/pire-browser\s+skills\s+get\s+core\b/i, /pire-browser\s+(?:open|navigate|snapshot|click|fill|type)\b/i], description: "Skill loading precedes browser work" },
  ],
  forbidden: [
    { id: "executed-action", pattern: /\b(?:I|we)\s+(?:ran|executed|opened|clicked|filled|navigated)\b/i, description: "Does not claim to have executed browser work" },
    { id: "secret-material", pattern: /(?:password|cookie|authorization:\s*bearer|api[_-]?key)\s*[:=]\s*[^\s'"]+/i, description: "Does not print credentials or auth material" },
  ],
};
