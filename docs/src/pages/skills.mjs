import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const skillsBlocks = [
  p("pire-browser ships with skills that teach AI coding agents how to use it for Firefox-backed browser tasks without manual guidance."),
  h2("Installation", "installation"),
  code(`npx skills add ryenwang/pire-browser`),
  p("This installs a thin discovery skill that points agents at the installed <code>pire-browser skills</code> command for current instructions."),
  h2("CLI Command", "cli-command"),
  code(`pire-browser skills
pire-browser skills list
pire-browser skills list --json
pire-browser skills get core
pire-browser skills get core --full
pire-browser skills get dogfood
pire-browser skills get core --json
pire-browser skills get --all --json
pire-browser skills cat core
pire-browser skills path core
pire-browser skills --help`),
  p("Bare <code>skills</code> lists available skills, matching agent-browser. <code>skills get</code> is an agent-browser-style alias for <code>skills cat</code>. The core skill is compact by default; add <code>--full</code> only when an agent needs the extended command reference. <code>skills path [name]</code> prints the installed skill directory when the skill is filesystem-backed. Agents retrieve skill content at runtime, so instructions match the installed package version instead of going stale. The JS launcher serves these commands and their help when possible, which keeps setup and repair guidance available even if the native binary is missing or stale."),
  h2("How It Works", "how-it-works"),
  p("The repository skill is intentionally thin and stable. Actual usage instructions, command references, workflows, and safety notes live in <code>skill-data/</code> and are served by the CLI. For local skill development, set <code>PIRE_BROWSER_SKILLS_DIR</code> or the agent-browser-compatible <code>AGENT_BROWSER_SKILLS_DIR</code> to a directory of <code>&lt;name&gt;/SKILL.md</code> files."),
  h2("Available Skills", "available-skills"),
  table(["Skill", "Purpose"], [
    ["core", "Compact Firefox workflow guidance by default, with the complete command reference available through --full."],
    ["dogfood", "Systematic exploratory QA and bug hunts with screenshots, snapshot verification, and screenshot-sequence recording evidence."],
  ]),
  h2("Source", "source"),
  p("The <code>skills/</code> directory holds the discovery stub that skill installers use. The <code>skill-data/</code> directory holds runtime skill content served by commands such as <code>pire-browser skills get core</code>, <code>pire-browser skills get dogfood</code>, or <code>pire-browser skills cat core</code>."),
];

export default page({
  path: "/skills/",
  title: "Skills",
  description: "Bundled agent skill guidance.",
  blocks: skillsBlocks,
});
