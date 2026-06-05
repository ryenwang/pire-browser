import { code, h2, h3, list, note, ol, p, page, providerBlocks, statusNote, table, unavailable } from "../blocks.mjs";

const skillsBlocks = [
  p("pire-browser ships with skills that teach AI coding agents how to use it for Firefox-backed browser tasks without manual guidance."),
  h2("Installation", "installation"),
  code(`npx skills add ryenwang/pire-browser`),
  p("This installs a thin discovery skill that points agents at the installed <code>pire-browser skills</code> command for current instructions."),
  h2("CLI Command", "cli-command"),
  code(`pire-browser skills list
pire-browser skills list --json
pire-browser skills cat core
pire-browser skills cat core --json`),
  p("Agents retrieve skill content at runtime, so instructions match the installed CLI version instead of going stale."),
  h2("How It Works", "how-it-works"),
  p("The repository skill is intentionally thin and stable. Actual usage instructions, command references, workflows, and safety notes live in <code>skill-data/</code> and are served by the CLI."),
  h2("Available Skills", "available-skills"),
  table(["Skill", "Purpose"], [["core", "Core Firefox browser automation: navigation, snapshots, forms, screenshots, data extraction, sessions, authentication, state, guardrails, and the command reference."]]),
  h2("Source", "source"),
  p("The <code>skills/</code> directory holds the discovery stub that skill installers use. The <code>skill-data/</code> directory holds runtime skill content served by <code>pire-browser skills cat core</code>."),
];

export default page({
  path: "/skills/",
  title: "Skills",
  description: "Bundled agent skill guidance.",
  blocks: skillsBlocks,
});
