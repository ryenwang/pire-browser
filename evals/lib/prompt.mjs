import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const DEFAULT_SKILL_PATH = resolve(EVALS_ROOT, "..", "skills", "pire-browser", "SKILL.md");

export async function loadSkill(skillPath = DEFAULT_SKILL_PATH) {
  return readFile(skillPath, "utf8");
}

export function buildPrompt(caseDefinition, skillText) {
  if (!caseDefinition?.id || !caseDefinition?.prompt) throw new TypeError("a case id and prompt are required");
  if (!skillText) throw new TypeError("the pire-browser skill must be injected into the prompt");
  return `You are completing the public pire-browser workflow evaluation case "${caseDefinition.id}".

Safety and output contract:
- Do not execute browser commands, open a browser, call MCP, or claim that an action happened.
- Propose exact commands an operator could run, in the order they should be run.
- Use the injected skill below as the authoritative command reference.
- Treat refs as short-lived: propose a fresh snapshot after navigation, DOM changes, dialogs, or actions before reusing refs.
- Keep credentials, cookies, tokens, passwords, and private page data out of the response.
- Include a short verification note after each action when the case asks for verification.

Injected skills/pire-browser/SKILL.md:
--- BEGIN INJECTED SKILL ---
${skillText.trim()}
--- END INJECTED SKILL ---

Evaluation task:
${caseDefinition.prompt.trim()}

Return a concise proposed workflow with literal command lines. Do not run any of them.`;
}
