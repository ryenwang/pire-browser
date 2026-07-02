#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectPiSettingsForConflicts,
  migratePiSettingsForKnownLegacySources,
} from "../scripts/pi-install-migration.mjs";
import { packageNameForTuple, platformTuple, resolveNativeBinary, rootDir, rootPackageJson } from "../scripts/platform.mjs";

const root = rootDir();
const packageJson = rootPackageJson(root);

const LAUNCHER_UPDATE_HELP = `
Usage:
  pire-browser update check [--json]
  pire-browser update apply [--json]
  pire-browser update configure --mode off|notify|patch

Checks or applies package updates through the npm/Pi JavaScript launcher. Update
checks are observational; apply mutates only global npm or Pi-managed installs.
Local project installs are notify-only so lockfiles and node_modules are not
changed unexpectedly. Background update checks never block browser commands.
`;

const LAUNCHER_UPGRADE_HELP = `
Usage:
  pire-browser upgrade [--json]

Agent-browser-style foreground upgrade path for installed npm/Pi packages. It
checks the npm registry, then applies the newest available pire-browser release
when the install is global npm or Pi-managed and no managed Firefox session is
active. Use lower-level \`pire-browser update check\`, \`update apply\`, and
\`update configure --mode off|notify|patch\` for explicit update management.
`;

const LAUNCHER_SKILLS_HELP = `
Usage:
  pire-browser skills list [--json]
  pire-browser skills get core [--json]
  pire-browser skills get dogfood [--json]
  pire-browser skills get --all [--json]
  pire-browser skills cat core [--json]
  pire-browser skills path [core] [--json]

Serves version-matched agent guidance from the installed package before native
binary resolution. \`skills get\` is the agent-browser-style spelling, \`skills
cat\` is the lower-level compatibility spelling, and \`skill\` is accepted as a
root alias. Set PIRE_BROWSER_SKILLS_DIR or AGENT_BROWSER_SKILLS_DIR to override
the skill directory during local development.
`;

const LAUNCHER_PI_HELP = `
Usage:
  pire-browser pi conflicts [--json] [--scope global|project|both] [--settings <path>]
  pire-browser pi repair [--json] [--dry-run] [--scope global|project|both] [--settings <path>] [--include-local]

Inspects and repairs duplicate Pi package registrations for pire-browser without
requiring the native binary. This does not run Pi itself. Use conflicts first to
see old GitHub/local/ZIP-era registrations, then repair to remove safe legacy
entries after npm:pire-browser is present.

Exit codes: conflicts exits 0 when inspection completes, even if conflicts are
found. repair exits 0 for successful repair, no-op, dry-run, missing npm source,
or advisory-scope conflicts; inspect JSON data.remainingConflicts, target
reason, and nextActions to know whether the install is fully resolved. Nonzero
is reserved for invalid args, explicit settings read/parse errors, settings
write failures, or required quarantine failures.
`;

const LAUNCHER_MCP_HELP = `
Usage:
  pire-browser mcp
  pire-browser mcp --tools core
  pire-browser mcp --tools core,network
  pire-browser mcp --tools core,state
  pire-browser mcp --tools all

Starts a Model Context Protocol server over stdio once the native platform
package is available. Use the smallest tools profile that fits the task.
\`core\` is the default inspect-before-act workflow: open/goto/navigate,
snapshots, semantic find/action tools, typed get/check tools, typed waits,
screenshots/PDFs/diffs, eval/evaluate, status, confirmation follow-up, tab
list/new/switch/close, profile discovery, close, and skill guidance.

Add comma-separated profiles when needed: \`network\` for request/response
waits and HAR, \`state\` for cookies/storage/auth/state/plugin discovery,
\`debug\` for launch/install/doctor/activity/trace/record/stream diagnostics,
\`tabs\` for tab labels/frames/dialogs/windows, \`mobile\` for viewport/device
helpers, and \`react\` for best-effort Firefox React inspection. Use \`all\`
only when the host can tolerate every implemented MCP tool.
`;

const LAUNCHER_NATIVE_UNAVAILABLE_HELP = `
pire-browser controls Firefox through a local WebExtension and native host.

Usage:
  pire-browser <command> [args]
  pire-browser help [topic]
  pire-browser <command> --help

Launcher-served commands available before native binary resolution:
  --version | version --json       Show installed package version
  install [--with-deps] [--firefox-path <path>] [--json]
                                   Register Firefox Native Messaging; reports repair guidance if native package is missing
  setup [--with-deps] [--firefox-path <path>] [--json]
                                   Lower-level install alias
  doctor [--json]                  Diagnose setup; JSON includes nextActions
  install-status [--json]          Alias for doctor diagnostics
  skills get core [--json]         Print version-matched agent guidance
  skills get dogfood [--json]      Print exploratory QA guidance
  mcp --tools core                 Start typed MCP server after native repair
  pi conflicts | pi repair         Inspect/repair duplicate Pi registrations
  upgrade | update check           Check or apply package updates

Common browser commands after native package repair:
  open <url>                       Launch/reuse Firefox and navigate
  snapshot -i                      Inspect the active page and print refs
  click '@e4'                      Click a fresh ref from snapshot/find
  fill '@e2' "text"                Fill a fresh ref
  press Enter                      Press a key at page focus
  screenshot                       Capture visual evidence

If command help cannot be served because the native package is missing, use
\`pire-browser skills get core\` for workflow guidance and \`pire-browser install
--json\` or \`pire-browser doctor --json\` for concrete repair commands.
`;

export function main(args = process.argv.slice(2)) {
  const versionResult = handleLauncherVersion(args);
  if (versionResult !== null) return versionResult;

  if (args[0] === "update") {
    if (wantsLauncherHelp(args.slice(1))) {
      console.log(LAUNCHER_UPDATE_HELP.trim());
      return 0;
    }
    return handleUpdate(args.slice(1));
  }

  if (args[0] === "upgrade") {
    if (wantsLauncherHelp(args.slice(1))) {
      console.log(LAUNCHER_UPGRADE_HELP.trim());
      return 0;
    }
    return handleUpgrade(args.slice(1));
  }

  const skillsResult = handleLauncherSkills(args);
  if (skillsResult !== null) return skillsResult;

  const piResult = handleLauncherPi(args);
  if (piResult !== null) return piResult;

  maybeStartBackgroundUpdateCheck(args);
  const resolved = resolveNativeBinary({ root });
  if (!resolved.ok) {
    const missingNativeResult = handleLauncherMissingNative(args, resolved);
    if (missingNativeResult !== null) return missingNativeResult;
    console.error(`pire-browser: ${resolved.reason}`);
    console.error("pire-browser: run `pire-browser doctor --json` for repair guidance.");
    return 1;
  }

  const result = runNative(resolved.path, args);
  maybeStartBackgroundPatchApply(args);
  if (result.error) {
    console.error(`pire-browser: failed to run ${resolved.path}: ${result.error.message}`);
    return 1;
  }
  if (result.signal) process.kill(process.pid, result.signal);
  return result.status ?? 1;
}

if (isEntrypoint()) {
  process.exit(main(process.argv.slice(2)));
}

function nativeEnv() {
  const env = { ...process.env };
  const extensionDir = join(root, "extension");
  env.PIRE_BROWSER_NODE_PATH ||= process.execPath;
  env.PIRE_BROWSER_LAUNCHER_PATH ||= fileURLToPath(import.meta.url);
  if (!env.PIRE_BROWSER_EXTENSION_DIR && existsSync(join(extensionDir, "manifest.json"))) {
    env.PIRE_BROWSER_EXTENSION_DIR = extensionDir;
  }
  return env;
}

function runNative(binary, nativeArgs) {
  const env = nativeEnv();
  if (process.platform !== "win32") {
    return spawnSync(binary, nativeArgs, { stdio: "inherit", windowsHide: true, env });
  }

  const tempDir = mkdtempSync(join(tmpdir(), "pire-browser-native-"));
  const stdoutPath = join(tempDir, "stdout.log");
  const stderrPath = join(tempDir, "stderr.log");
  let stdoutFd;
  let stderrFd;
  try {
    stdoutFd = openSync(stdoutPath, "w");
    stderrFd = openSync(stderrPath, "w");
    const result = spawnSync(binary, nativeArgs, {
      stdio: ["ignore", stdoutFd, stderrFd],
      windowsHide: true,
      env,
    });
    closeIfOpen(stdoutFd);
    closeIfOpen(stderrFd);
    stdoutFd = undefined;
    stderrFd = undefined;
    forwardFile(stdoutPath, process.stdout);
    forwardFile(stderrPath, process.stderr);
    return result;
  } finally {
    closeIfOpen(stdoutFd);
    closeIfOpen(stderrFd);
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function closeIfOpen(fd) {
  if (fd === undefined) return;
  try {
    closeSync(fd);
  } catch {
    // Best-effort cleanup for launcher diagnostics.
  }
}

function forwardFile(path, stream) {
  if (!existsSync(path)) return;
  const body = readFileSync(path, "utf8");
  if (body) stream.write(body);
}

export function handleLauncherVersion(args, options = {}) {
  const output = options.output ?? console.log;
  const error = options.error ?? console.error;
  const json = args.includes("--json");
  if (args[0] === "version") {
    const versionArgs = args.slice(1).filter((arg) => arg !== "--json");
    if (wantsLauncherHelp(versionArgs)) {
      output("Usage: pire-browser version [--json]");
      return 0;
    }
    if (versionArgs.length > 0) {
      return outputLauncherError(`unsupported version option: ${versionArgs[0]}`, json, output, error);
    }
    return outputVersion(json, output);
  }

  if (args.includes("--version") || args.includes("-V")) {
    const unsupported = args.filter((arg) => !["--version", "-V", "--json"].includes(arg));
    if (unsupported.length > 0) return null;
    return outputVersion(json, output);
  }
  return null;
}

function outputVersion(json, output) {
  const data = { name: packageJson.name ?? "pire-browser", version: packageJson.version };
  if (json) output(successEnvelope(data));
  else output(`${data.name} ${data.version}`);
  return 0;
}

export function handleLauncherMissingNative(args, resolved, options = {}) {
  const output = options.output ?? console.log;
  if (wantsLauncherHelp(args)) {
    output(formatLauncherMissingNativeHelp(args, resolved));
    return 0;
  }
  const rootCommand = launcherRootCommand(args);
  if (!["doctor", "install-status", "install", "setup"].includes(rootCommand)) return null;

  const json = args.includes("--json");
  const diagnostic = launcherInstallDiagnosticForMissingNative(resolved, args);
  if (json) {
    output(
      JSON.stringify(
        {
          success: false,
          error: {
            code: "native_binary_unavailable",
            message: diagnostic.message,
          },
          data: diagnostic,
          warnings: [],
        },
        null,
        2
      )
    );
  } else {
    output(formatLauncherInstallDiagnosticPlain(diagnostic));
  }
  return 1;
}

export function formatLauncherMissingNativeHelp(args, resolved) {
  const topic = launcherHelpTopic(args);
  const version = packageJson.version;
  const tuple = resolved.tuple ?? safePlatformTuple();
  const packageName = resolved.packageName ?? (tuple ? packageNameForTupleSafe(tuple) : null);
  const repairHint = packageName
    ? `\nNative package unavailable: ${packageName}@${version}${tuple ? ` for ${tuple}` : ""}.\nRepair: npm install -g pire-browser@${version} --include=optional\n`
    : `\nNative package unavailable: ${resolved.reason}\nRepair: npm install -g pire-browser@${version} --include=optional\n`;

  if (!topic || topic === "commands") return `${LAUNCHER_NATIVE_UNAVAILABLE_HELP.trim()}\n${repairHint}`.trim();
  if (topic === "install") {
    return `${`
Usage:
  pire-browser install [--with-deps] [--firefox-path <path>] [--json]

Agent-browser-style setup command. Registers the Firefox Native Messaging host
for the current OS user. If the optional native package is missing, this
launcher-served path reports concrete repair commands instead of requiring the
native binary first.
`.trim()}\n${repairHint}`.trim();
  }
  if (topic === "setup") {
    return `${`
Usage:
  pire-browser setup [--with-deps] [--firefox-path <path>] [--json]
  pire-browser setup --windows [--with-deps] [--firefox-path <path>] [--json]

Lower-level setup command for Firefox Native Messaging. Prefer
\`pire-browser install\` for agent-browser-style first-run setup.
`.trim()}\n${repairHint}`.trim();
  }
  if (topic === "doctor" || topic === "install-status") {
    return `${`
Usage:
  pire-browser doctor [--json] [--offline] [--fix] [--with-deps]
  pire-browser install-status [--json] [--offline]

Read-only install diagnostics by default. When the optional native package is
missing, \`--json\` is served by the JavaScript launcher and exits nonzero with
\`error.code = "native_binary_unavailable"\` plus \`data.nextActions\`.
`.trim()}\n${repairHint}`.trim();
  }
  if (topic === "skills" || topic === "skill") return LAUNCHER_SKILLS_HELP.trim();
  if (topic === "mcp") {
    return `${LAUNCHER_MCP_HELP.trim()}\n${repairHint}`.trim();
  }
  if (topic === "pi") return LAUNCHER_PI_HELP.trim();
  if (topic === "update") return LAUNCHER_UPDATE_HELP.trim();
  if (topic === "upgrade") return LAUNCHER_UPGRADE_HELP.trim();
  if (topic === "version") return "Usage: pire-browser version [--json]";
  return `${`
Help for \`${topic}\` requires the native platform package. The installed
launcher can still serve setup, update, Pi repair, version, and skills guidance.
Run \`pire-browser skills get core\` for browser workflow recipes after repair.
`.trim()}\n${repairHint}`.trim();
}

export function launcherInstallDiagnosticForMissingNative(resolved, args = []) {
  const command = launcherRootCommand(args) ?? "doctor";
  const tuple = resolved.tuple ?? safePlatformTuple();
  const platformPackage = resolved.packageName ?? (tuple ? packageNameForTupleSafe(tuple) : null);
  const version = packageJson.version;
  const nativeBinary = {
    ok: false,
    tuple,
    packageName: platformPackage,
    reason: resolved.reason,
    source: resolved.source ?? "launcher",
  };
  const nextActions = [];
  if (resolved.reason?.startsWith("PIRE_BROWSER_BINARY") || resolved.reason?.startsWith("PIRE_BROWSER_EXE")) {
    nextActions.push({
      code: "fix_binary_override",
      reason: "A native binary override points to a missing file.",
      command: "Unset PIRE_BROWSER_BINARY and PIRE_BROWSER_EXE, or point the variable to an existing pire-browser binary.",
      note: "Overrides are for tests and emergency diagnostics; normal npm/Pi installs should use the packaged optional native dependency.",
    });
  }
  if (platformPackage) {
    nextActions.push({
      code: "reinstall_optional_native_package",
      reason: `The optional native package ${platformPackage}@${version} for ${tuple} is missing.`,
      command: `npm install -g pire-browser@${version} --include=optional`,
      note: `For project installs, run \`npm install pire-browser@${version} --include=optional\` from the project root. For Pi installs, rerun \`pi install npm:pire-browser\`.`,
    });
    nextActions.push({
      code: "check_optional_dependency_settings",
      reason: "npm may have installed pire-browser with optional dependencies disabled.",
      command: "npm config get omit",
      note: "If the output includes `optional`, reinstall with `--include=optional` or remove the omit setting before reinstalling.",
    });
  }
  if (nextActions.length === 0) {
    nextActions.push({
      code: "reinstall_pire_browser",
      reason: "The native binary could not be resolved for this install.",
      command: `npm install -g pire-browser@${version} --include=optional`,
      note: "If this is a Pi install, rerun `pi install npm:pire-browser`; if Pi reports a duplicate tool conflict, run `npx -y pire-browser@latest pi repair`.",
    });
  }
  nextActions.push({
    code: "repair_pi_duplicate_if_needed",
    reason: "Pi may still fail to start if an older GitHub/local pire-browser install is also registered.",
    command: "npx -y pire-browser@latest pi repair",
    note: "Use this only when Pi reports a duplicate `pire-browser` tool after reinstalling.",
  });
  return {
    ok: false,
    source: "launcher",
    command,
    message: launcherMissingNativeMessage(command, resolved.reason),
    package: {
      name: packageJson.name ?? "pire-browser",
      version,
    },
    nativeBinary,
    nextActions,
  };
}

function launcherMissingNativeMessage(command, reason) {
  if (command === "install" || command === "setup") {
    return `Cannot run ${command} because the native pire-browser package is unavailable. ${reason}`;
  }
  return reason;
}

export function formatLauncherInstallDiagnosticPlain(diagnostic) {
  const lines = [
    "pire-browser install status: needs attention",
    `[missing] Native binary: ${diagnostic.message}`,
  ];
  if (diagnostic.nativeBinary.packageName) {
    lines.push(`[missing] Native package: ${diagnostic.nativeBinary.packageName}`);
  }
  if (diagnostic.nativeBinary.tuple) {
    lines.push(`Platform: ${diagnostic.nativeBinary.tuple}`);
  }
  lines.push("Next actions:");
  for (const action of diagnostic.nextActions) {
    lines.push(`  - [${action.code}] ${action.reason}`);
    if (action.command) lines.push(`    command: ${action.command}`);
    if (action.note) lines.push(`    note: ${action.note}`);
  }
  return lines.join("\n");
}

function launcherRootCommand(args) {
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--firefox-path" || arg === "--config" || arg === "--profile" || arg === "--session-name") {
      i += 1;
      continue;
    }
    if (!arg.startsWith("-")) return arg;
  }
  return null;
}

function launcherHelpTopic(args) {
  if (args[0] === "help") return args[1] && !args[1].startsWith("-") ? args[1] : null;
  const rootCommand = launcherRootCommand(args);
  if (!rootCommand || rootCommand === "help") return null;
  return rootCommand;
}

function safePlatformTuple() {
  try {
    return platformTuple(process.platform, process.arch);
  } catch {
    return null;
  }
}

function packageNameForTupleSafe(tuple) {
  try {
    return packageNameForTuple(tuple);
  } catch {
    return null;
  }
}

export function handleLauncherSkills(args, options = {}) {
  const output = options.output ?? console.log;
  const error = options.error ?? console.error;
  if (!["skills", "skill"].includes(args[0])) return null;

  const skillArgs = args.slice(1);
  if (wantsLauncherHelp(skillArgs)) {
    output(LAUNCHER_SKILLS_HELP.trim());
    return 0;
  }
  const json = removeFlag(skillArgs, "--json");
  const subcommand = skillArgs.shift() ?? "list";
  if (subcommand === "list") {
    if (skillArgs.length > 0) {
      return outputSkillsError(`unsupported skills list option: ${skillArgs[0]}`, json, output, error);
    }
    return outputSkillsList(json, output);
  }
  if (subcommand === "cat" || subcommand === "get") {
    const full = removeFlag(skillArgs, "--full");
    void full;
    if (removeFlag(skillArgs, "--all")) {
      if (skillArgs.length > 0) {
        return outputSkillsError(`unsupported skills ${subcommand} option: ${skillArgs[0]}`, json, output, error);
      }
      return outputSkillsCatAll(json, output);
    }
    const name = skillArgs.shift();
    if (!name) {
      return outputSkillsError(`invalid_args: skills ${subcommand} requires <name>`, json, output, error);
    }
    if (skillArgs.length > 0) {
      return outputSkillsError(`unsupported skills ${subcommand} option: ${skillArgs[0]}`, json, output, error);
    }
    return outputSkillsCat(name, json, output, error);
  }
  if (subcommand === "path") {
    const name = skillArgs.shift() ?? "core";
    if (name.startsWith("-")) {
      return outputSkillsError(`unsupported skills path option: ${name}`, json, output, error);
    }
    if (skillArgs.length > 0) {
      return outputSkillsError(`unsupported skills path option: ${skillArgs[0]}`, json, output, error);
    }
    return outputSkillsPath(name, json, output, error);
  }
  if (subcommand.startsWith("-")) {
    return outputSkillsError(`unsupported skills option: ${subcommand}`, json, output, error);
  }
  return outputSkillsError(`unsupported skills command: ${subcommand}; try \`pire-browser skills list\``, json, output, error);
}

function outputSkillsList(json, output) {
  const skills = launcherSkills();
  if (json) output(successEnvelope({ skills }));
  else {
    for (const skill of skills) output(`${skill.name}\t${skill.description}`);
  }
  return 0;
}

function outputSkillsCat(name, json, output, error) {
  const skill = launcherSkillContent(name);
  if (!skill) {
    const available = launcherSkills().map((item) => item.name).join(", ");
    return outputSkillsError(`unknown skill: No skill named \`${name}\`. Available skills: ${available}.`, json, output, error);
  }
  if (json) output(successEnvelope({ skill }));
  else process.stdout.write(skill.content);
  return 0;
}

function outputSkillsCatAll(json, output) {
  const skills = launcherSkills().map((skill) => launcherSkillContent(skill.name)).filter(Boolean);
  if (json) output(successEnvelope({ skills }));
  else process.stdout.write(skills.map((skill) => skill.content).join("\n"));
  return 0;
}

function outputSkillsPath(name, json, output, error) {
  const path = launcherSkillPath(name);
  if (!path) {
    const available = launcherSkills().map((item) => item.name).join(", ");
    return outputSkillsError(`unknown skill: No skill named \`${name}\`. Available skills: ${available}.`, json, output, error);
  }
  const skill = launcherSkillContent(name);
  if (json) output(successEnvelope({ skill: { name, description: skill?.description ?? "", path } }));
  else output(path);
  return 0;
}

function outputSkillsError(message, json, output, error) {
  const cleanMessage = message.replace(/^invalid_args: /, "");
  if (json) {
    output(
      JSON.stringify(
        {
          success: false,
          error: {
            code: message.startsWith("invalid_args:") ? "invalid_args" : "unsupported_command",
            message: cleanMessage,
          },
          warnings: [],
        },
        null,
        2
      )
    );
  } else {
    error(`${message.startsWith("invalid_args:") ? "invalid_args" : "unsupported_command"}: ${cleanMessage}`);
  }
  return 1;
}

function launcherSkills() {
  const names = launcherSkillNames();
  const skills = names
    .map((name) => launcherSkillContent(name))
    .filter(Boolean)
    .map((skill) => ({ name: skill.name, description: skill.description }))
    .sort((left, right) => left.name.localeCompare(right.name));
  if (skills.length > 0) return skills;
  if (launcherSkillsRootIsOverride()) return [];
  return [{ name: "core", description: "Core pire-browser workflow for safe Firefox automation." }];
}

function launcherSkillContent(name) {
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return null;
  const path = launcherSkillFile(name);
  if (!existsSync(path)) return null;
  const content = normalizeSkillText(readFileSync(path, "utf8"));
  const frontmatter = skillFrontmatter(content);
  if (!frontmatter || frontmatter.name !== name) return null;
  return {
    name: frontmatter.name,
    description: frontmatter.description,
    content,
  };
}

function launcherSkillPath(name) {
  if (!launcherSkillContent(name)) return null;
  return dirname(launcherSkillFile(name));
}

function launcherSkillFile(name) {
  return join(launcherSkillsRoot(), name, "SKILL.md");
}

function launcherSkillsRoot(env = process.env) {
  return nonEmptyEnv(env.PIRE_BROWSER_SKILLS_DIR) ?? nonEmptyEnv(env.AGENT_BROWSER_SKILLS_DIR) ?? join(root, "skill-data");
}

function launcherSkillsRootIsOverride(env = process.env) {
  return Boolean(nonEmptyEnv(env.PIRE_BROWSER_SKILLS_DIR) ?? nonEmptyEnv(env.AGENT_BROWSER_SKILLS_DIR));
}

function nonEmptyEnv(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function launcherSkillNames() {
  const skillRoot = launcherSkillsRoot();
  try {
    return readdirSync(skillRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^[A-Za-z0-9_.-]+$/.test(name))
      .filter((name) => existsSync(join(skillRoot, name, "SKILL.md")));
  } catch {
    return [];
  }
}

function skillFrontmatter(content) {
  const lines = content.split("\n");
  if (lines.shift() !== "---") return null;
  let name = "";
  let description = "";
  for (const line of lines) {
    if (line === "---") break;
    const index = line.indexOf(":");
    if (index === -1) return null;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^"(.*)"$/, "$1");
    if (key === "name") name = value;
    if (key === "description") description = value;
  }
  if (!name) return null;
  return { name, description };
}

function normalizeSkillText(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function handleLauncherPi(args, options = {}) {
  const output = options.output ?? console.log;
  const error = options.error ?? console.error;
  if (args[0] !== "pi") return null;

  const piArgs = args.slice(1);
  if (wantsLauncherHelp(piArgs)) {
    output(LAUNCHER_PI_HELP.trim());
    return 0;
  }
  const subcommand = piArgs.shift() ?? "conflicts";
  if (!["conflicts", "repair"].includes(subcommand)) {
    return outputPiError(`unsupported pi command: ${subcommand}; try \`pire-browser pi conflicts\``, false, output, error);
  }

  const parsed = parsePiCommandArgs(subcommand, piArgs);
  if (!parsed.ok) return outputPiError(parsed.message, parsed.json, output, error);
  return subcommand === "conflicts"
    ? runPiConflicts(parsed.options, output, error)
    : runPiRepair(parsed.options, output, error);
}

function parsePiCommandArgs(subcommand, args) {
  const options = {
    json: false,
    dryRun: false,
    includeLocal: false,
    scope: subcommand === "repair" ? "global" : "both",
    settingsPath: null,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") options.json = true;
    else if (arg === "--dry-run" && subcommand === "repair") options.dryRun = true;
    else if (arg === "--include-local" && subcommand === "repair") options.includeLocal = true;
    else if (arg === "--scope") {
      const scope = args[index + 1];
      if (!["global", "project", "both"].includes(scope)) {
        return { ok: false, json: options.json, message: "pi command requires --scope global|project|both" };
      }
      options.scope = scope;
      index += 1;
    } else if (arg === "--settings") {
      const settingsPath = args[index + 1];
      if (!settingsPath || settingsPath.startsWith("-")) {
        return { ok: false, json: options.json, message: "pi command requires --settings <path>" };
      }
      options.settingsPath = resolve(settingsPath);
      index += 1;
    } else {
      return { ok: false, json: options.json, message: `unsupported pi ${subcommand} option: ${arg}` };
    }
  }
  return { ok: true, options };
}

function runPiConflicts(options, output, error) {
  const targets = resolvePiSettingsTargets(options);
  const inspections = targets.map((target) => inspectPiTarget(target));
  const explicitError = inspections.find((inspection) => inspection.explicit && isInvalidInspection(inspection));
  if (explicitError) {
    return outputPiError(
      settingsInspectionError(explicitError),
      options.json,
      output,
      error,
      explicitError,
      "settings_unavailable"
    );
  }
  const data = piConflictData(inspections);
  if (options.json) output(JSON.stringify({ success: true, data, warnings: [] }, null, 2));
  else output(formatPiConflictsPlain(data));
  return 0;
}

function runPiRepair(options, output, error) {
  const primaryTargets = resolvePiSettingsTargets(options);
  const advisoryTargets = options.settingsPath ? [] : advisoryPiSettingsTargets(options.scope, primaryTargets);
  const repairResults = [];
  const advisoryInspections = [];

  for (const target of primaryTargets) {
    const inspection = inspectPiTarget(target);
    if (inspection.explicit && isInvalidInspection(inspection)) {
      return outputPiError(
        settingsInspectionError(inspection),
        options.json,
        output,
        error,
        inspection,
        "settings_unavailable"
      );
    }
    if (inspection.reason === "missing_settings" && !target.explicit) {
      repairResults.push({ ...inspection, skipped: true });
      continue;
    }
    repairResults.push({
      ...target,
      ...migratePiSettingsForKnownLegacySources(target.settingsPath, {
        requireNpmSource: true,
        includeLocal: options.includeLocal,
        dryRun: options.dryRun,
      }),
    });
  }

  for (const target of advisoryTargets) {
    const inspection = inspectPiTarget(target);
    if (inspection.reason !== "missing_settings") advisoryInspections.push(inspection);
  }

  const data = piRepairData({ options, repairResults, advisoryInspections });
  const report = writePiRepairReport(data);
  data.reportPath = report.path;
  if (report.error) data.reportError = report.error;

  if (options.json) output(JSON.stringify({ success: true, data, warnings: [] }, null, 2));
  else output(formatPiRepairPlain(data));

  return repairResults.some((result) => hasRepairFailure(result)) ? 1 : 0;
}

function resolvePiSettingsTargets({ scope, settingsPath }, env = process.env, cwd = process.cwd()) {
  if (settingsPath) {
    return [{ scope: "settings", settingsPath, explicit: true }];
  }
  const targets = [];
  if (scope === "global" || scope === "both") {
    targets.push({ scope: "global", settingsPath: globalPiSettingsPath(env), explicit: false });
  }
  if (scope === "project" || scope === "both") {
    targets.push({ scope: "project", settingsPath: join(cwd, ".pi", "settings.json"), explicit: false });
  }
  return dedupePiTargets(targets);
}

function globalPiSettingsPath(env = process.env) {
  if (env.PI_CODING_AGENT_DIR) {
    const normalized = env.PI_CODING_AGENT_DIR.replace(/[\\/]+$/, "");
    if (normalized.split(/[\\/]+/).pop()?.toLowerCase() === "agent") {
      return join(env.PI_CODING_AGENT_DIR, "settings.json");
    }
    return join(env.PI_CODING_AGENT_DIR, "agent", "settings.json");
  }
  return join(env.PI_HOME || join(homedir(), ".pi"), "agent", "settings.json");
}

function advisoryPiSettingsTargets(scope, primaryTargets) {
  if (scope === "both") return [];
  const primaryPaths = new Set(primaryTargets.map((target) => target.settingsPath));
  return resolvePiSettingsTargets({ scope: scope === "global" ? "project" : "global", settingsPath: null }).filter(
    (target) => !primaryPaths.has(target.settingsPath)
  );
}

function dedupePiTargets(targets) {
  const seen = new Set();
  return targets.filter((target) => {
    const key = target.settingsPath.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inspectPiTarget(target) {
  return { ...target, ...inspectPiSettingsForConflicts(target.settingsPath) };
}

function isInvalidInspection(inspection) {
  return inspection.reason === "missing_settings" || inspection.reason.startsWith("invalid_settings:");
}

function settingsInspectionError(inspection) {
  if (inspection.reason === "missing_settings") return `Pi settings file does not exist: ${inspection.settingsPath}`;
  return `Could not read Pi settings file ${inspection.settingsPath}: ${inspection.reason.replace(/^invalid_settings: /, "")}`;
}

function piConflictData(inspections) {
  const activeInspections = inspections.filter((inspection) => inspection.reason !== "missing_settings");
  const conflicts = activeInspections.flatMap((inspection) =>
    inspection.conflicts.map((conflict) => ({ scope: inspection.scope, settingsPath: inspection.settingsPath, ...conflict }))
  );
  return {
    operation: "conflicts",
    targets: inspections.map(summarizeInspection),
    hasConflicts: conflicts.length > 0,
    conflictCount: conflicts.length,
    conflicts,
    nextActions: piConflictNextActions(conflicts),
  };
}

function piRepairData({ options, repairResults, advisoryInspections }) {
  const remainingConflicts = advisoryInspections.flatMap((inspection) =>
    inspection.conflicts.map((conflict) => ({ scope: inspection.scope, settingsPath: inspection.settingsPath, ...conflict }))
  );
  return {
    operation: "repair",
    dryRun: options.dryRun,
    includeLocal: options.includeLocal,
    targets: repairResults.map(summarizeRepairResult),
    remainingConflicts,
    nextActions: piRepairNextActions(repairResults, remainingConflicts, options),
  };
}

function summarizeInspection(inspection) {
  return {
    scope: inspection.scope,
    settingsPath: inspection.settingsPath,
    explicit: inspection.explicit,
    reason: inspection.reason,
    skipped: inspection.reason === "missing_settings" && !inspection.explicit,
    npmSourcePresent: inspection.npmSourcePresent,
    conflictCount: inspection.conflicts.length,
    conflicts: inspection.conflicts,
  };
}

function summarizeRepairResult(result) {
  return {
    scope: result.scope,
    settingsPath: result.settingsPath,
    explicit: result.explicit,
    reason: result.reason,
    skipped: Boolean(result.skipped),
    changed: Boolean(result.changed),
    dryRun: Boolean(result.dryRun),
    wouldChange: Boolean(result.wouldChange),
    removed: result.removed ?? [],
    localSkipped: result.localSkipped ?? [],
    removedShims: result.removedShims ?? [],
    quarantinedDirs: result.quarantinedDirs ?? [],
    directoryBackupPaths: result.directoryBackupPaths ?? [],
    ...(result.backupPath ? { backupPath: result.backupPath } : {}),
    ...(result.shimBackupPath ? { shimBackupPath: result.shimBackupPath } : {}),
    ...(result.quarantineErrors ? { quarantineErrors: result.quarantineErrors } : {}),
    ...(result.writeError ? { writeError: result.writeError } : {}),
  };
}

function piConflictNextActions(conflicts) {
  if (conflicts.length === 0) return [];
  const actions = ["Run `pire-browser pi repair` to remove safe legacy GitHub/ZIP-era duplicate registrations."];
  if (conflicts.some((conflict) => conflict.kind === "local-checkout")) {
    actions.push("Local checkout conflicts are reported only; rerun repair with `--include-local` if npm:pire-browser is the intended replacement.");
  }
  return actions;
}

function piRepairNextActions(repairResults, remainingConflicts, options) {
  const actions = [];
  if (repairResults.some((result) => result.reason === "missing_npm_source")) {
    actions.push("Install the npm package first with `pi install npm:pire-browser`, then rerun `pire-browser pi repair`.");
  }
  if (repairResults.some((result) => (result.localSkipped ?? []).length > 0)) {
    actions.push("Verified local checkout conflicts were left in place; rerun with `--include-local` if npm:pire-browser should replace them.");
  }
  if (remainingConflicts.length > 0) {
    const scopes = [...new Set(remainingConflicts.map((conflict) => conflict.scope))].join(", ");
    actions.push(`Conflicts remain in ${scopes} scope; rerun with \`--scope ${scopes.includes("project") ? "project" : "global"}\`.`);
  }
  if (options.dryRun) actions.push("Dry run only; rerun without `--dry-run` to apply changes.");
  return actions;
}

function hasRepairFailure(result) {
  return result.reason === "settings_write_failed" || (result.quarantineErrors ?? []).length > 0;
}

function writePiRepairReport(data) {
  const path = join(dataDir(), "pi-repair", data.dryRun ? "dry-run-latest.json" : "latest.json");
  try {
    writeJson(path, { ...data, reportPath: path });
    return { path };
  } catch (error) {
    return { path, error: error.message };
  }
}

function formatPiConflictsPlain(data) {
  if (!data.hasConflicts) return "No Pi pire-browser install conflicts found.";
  const lines = [`Found ${data.conflictCount} Pi pire-browser install conflict(s):`];
  for (const conflict of data.conflicts) {
    const location = conflict.source ?? conflict.path;
    lines.push(`- ${conflict.scope}: ${conflict.kind} ${location}`);
  }
  for (const action of data.nextActions) lines.push(`Next: ${action}`);
  return lines.join("\n");
}

function formatPiRepairPlain(data) {
  const changedCount = data.targets.filter((target) => target.changed || target.wouldChange).length;
  const prefix = data.dryRun ? "pire-browser pi repair dry run" : "pire-browser pi repair";
  const lines = [`${prefix}: ${changedCount > 0 ? "completed" : "no safe changes needed"}.`];
  for (const target of data.targets) {
    if (target.skipped) {
      lines.push(`- ${target.scope}: skipped missing settings (${target.settingsPath})`);
      continue;
    }
    const action = data.dryRun && target.wouldChange ? "would change" : target.changed ? "changed" : "unchanged";
    lines.push(`- ${target.scope}: ${action} (${target.reason})`);
    for (const source of target.removed) lines.push(`  removed package source: ${source}`);
    for (const source of target.localSkipped) lines.push(`  left local checkout source: ${source}`);
    for (const path of target.removedShims) lines.push(`  removed legacy shim: ${path}`);
    for (const path of target.quarantinedDirs) lines.push(`  quarantined legacy checkout: ${path}`);
  }
  if (data.remainingConflicts.length > 0) {
    lines.push(`Remaining conflicts outside repaired scope: ${data.remainingConflicts.length}`);
  }
  for (const action of data.nextActions) lines.push(`Next: ${action}`);
  if (data.reportError) lines.push(`Report failed: ${data.reportError}`);
  else lines.push(`Report: ${data.reportPath}`);
  return lines.join("\n");
}

function outputPiError(message, json, output, error, details = null, code = "invalid_args") {
  if (json) {
    output(
      JSON.stringify(
        {
          success: false,
          error: { code, message },
          ...(details ? { data: { details } } : {}),
          warnings: [],
        },
        null,
        2
      )
    );
  } else {
    error(`pire-browser: ${message}`);
  }
  return 2;
}

function outputLauncherError(message, json, output, error, code = "invalid_args") {
  if (json) {
    output(JSON.stringify({ success: false, error: { code, message }, warnings: [] }, null, 2));
  } else {
    error(`pire-browser: ${message}`);
  }
  return 2;
}

function successEnvelope(data) {
  return JSON.stringify({ success: true, data, warnings: [] }, null, 2);
}

function wantsLauncherHelp(args) {
  return args.length === 0
    ? false
    : args.some((arg) => arg === "--help" || arg === "-h") || args[0] === "help";
}

function handleUpdate(updateArgs) {
  const background = removeFlag(updateArgs, "--background");
  const backgroundWorker = removeFlag(updateArgs, "--background-worker");
  const delayMs = Number(removeValueFlag(updateArgs, "--delay-ms") ?? 0);
  const json = removeFlag(updateArgs, "--json");
  const subcommand = updateArgs.shift() ?? "check";
  if (subcommand === "configure") return configureUpdate(updateArgs, json);
  if (subcommand === "check") return checkUpdate({ json, background });
  if (subcommand === "apply") return applyUpdate({ json, background, backgroundWorker, delayMs });
  return outputUpdateError(`unsupported update command: ${subcommand}`, json, background);
}

function handleUpgrade(upgradeArgs) {
  const json = removeFlag(upgradeArgs, "--json");
  if (upgradeArgs.length > 0) {
    return outputUpdateError(`unsupported upgrade option: ${upgradeArgs[0]}`, json, false);
  }
  const update = getUpdateRecommendation({ background: false });
  if (update.kind === "offline") {
    return outputUpdateResult("offline", "offline mode is enabled", json, false, 0, { operation: "upgrade", update });
  }
  if (update.kind === "unknown") {
    return outputUpdateResult(
      "unknown",
      "could not check the npm registry",
      json,
      false,
      1,
      {
        operation: "upgrade",
        update,
        nextAction: "Check network access or run `pire-browser update check --json` for details.",
      }
    );
  }
  if (!update.available) {
    return outputUpdateResult("current", "already current", json, false, 0, { operation: "upgrade", update });
  }
  return applyUpdate({ json, background: false, update, allowAnySemver: true, upgrade: true, operation: "upgrade" });
}

function configureUpdate(updateArgs, json) {
  let mode = null;
  for (let i = 0; i < updateArgs.length; i += 1) {
    if (updateArgs[i] === "--mode") {
      mode = updateArgs[i + 1] ?? null;
      i += 1;
      continue;
    }
    return outputUpdateError(`unsupported update configure option: ${updateArgs[i]}`, json, false);
  }
  if (!["off", "notify", "patch"].includes(mode)) {
    return outputUpdateError("update configure requires --mode off|notify|patch", json, false);
  }
  const config = readUpdateConfig();
  config.mode = mode;
  writeJson(configPath(), config);
  outputUpdate({ mode }, json);
  return 0;
}

function checkUpdate({ json, background, silent = false }) {
  const update = getUpdateRecommendation({ background });
  if (!background && !silent) outputUpdate({ update }, json);
  return 0;
}

function applyUpdate({
  json,
  background,
  backgroundWorker = false,
  delayMs = 0,
  update = null,
  allowAnySemver = false,
  upgrade = false,
  operation = "update",
}) {
  if (isOfflineEnv()) return outputUpdateResult("offline", "offline mode is enabled", json, background, 0, { operation });
  const config = readUpdateConfig();
  if (config.mode === "off") return outputUpdateResult("disabled", "update mode is off", json, background);
  const cache = update ?? readJson(cachePath()) ?? {};
  if (!cache.available) {
    const message = cache.kind === "none" ? "already current" : "no cached update is available";
    return outputUpdateResult("current", message, json, background, 0, { operation, update: cache });
  }
  if (cache.kind !== "patch" && !allowAnySemver) {
    return outputUpdateResult(
      "notify",
      "minor and major updates require an explicit upgrade",
      json,
      background,
      0,
      { operation, update: cache, nextAction: "Run `pire-browser upgrade` to update to the latest version." }
    );
  }
  const installKind = detectInstallKind();
  if (!["global", "pi"].includes(installKind.kind)) {
    return outputUpdateResult(
      "notify",
      "local project installs are notify-only",
      json,
      background,
      0,
      { operation, update: cache, install: installKind, nextAction: localInstallUpgradeHint(cache.latestVersion) }
    );
  }
  if (hasActiveManagedSession()) {
    return outputUpdateResult(
      "deferred",
      "managed Firefox sessions are active",
      json,
      background,
      0,
      {
        operation,
        update: cache,
        install: installKind,
        nextAction: "Close managed Firefox sessions, then rerun `pire-browser upgrade`.",
      }
    );
  }
  if (background && process.platform === "win32" && !backgroundWorker) {
    spawnDetached(process.execPath, [
      fileURLToPath(import.meta.url),
      "update",
      "apply",
      "--background",
      "--background-worker",
      "--delay-ms",
      "1500",
      "--json",
    ]);
    return 0;
  }
  if (delayMs > 0) sleep(delayMs);
  const command =
    installKind.kind === "pi"
      ? ["pi", ["update", "npm:pire-browser"]]
      : ["npm", ["install", "-g", `pire-browser@${cache.latestVersion}`, "--include=optional"]];
  const commandText = formatCommand(command);
  const maxAttempts = backgroundWorker ? 3 : 1;
  let lastStatus = 1;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = runInstallCommand(command, background);
    if (result.status === 0) {
      return outputUpdateResult(
        "applied",
        `updated to ${cache.latestVersion}`,
        json,
        background,
        0,
        { operation, update: cache, install: installKind, command: commandText, upgrade }
      );
    }
    lastStatus = result.status ?? 1;
    if (attempt >= maxAttempts || !isLockLikeFailure(result)) break;
    sleep(750 * attempt);
  }
  return outputUpdateResult(
    "failed",
    `update command exited with ${lastStatus}`,
    json,
    background,
    1,
    {
      operation,
      update: cache,
      install: installKind,
      command: commandText,
      nextAction: installFailureHint(installKind, cache.latestVersion),
    }
  );
}

function maybeStartBackgroundUpdateCheck(commandArgs) {
  if (process.env.PIRE_BROWSER_DISABLE_UPDATE_CHECK === "1") return;
  if (isOfflineEnv()) return;
  if (isObservationalCommand(commandArgs)) return;
  const config = readUpdateConfig();
  if (config.mode === "off") return;
  const cache = readJson(cachePath());
  if (cache?.checkedAt && Date.now() - cache.checkedAt < 24 * 60 * 60 * 1000) return;
  spawnDetached(process.execPath, [fileURLToPath(import.meta.url), "update", "check", "--background", "--json"]);
}

function maybeStartBackgroundPatchApply(commandArgs) {
  if (process.env.PIRE_BROWSER_DISABLE_UPDATE_CHECK === "1") return;
  if (isOfflineEnv()) return;
  if (isObservationalCommand(commandArgs)) return;
  const config = readUpdateConfig();
  if (config.mode !== "patch") return;
  const cache = readJson(cachePath());
  if (!cache?.available || cache.kind !== "patch") return;
  spawnDetached(process.execPath, [fileURLToPath(import.meta.url), "update", "apply", "--background", "--json"]);
}

function isObservationalCommand(commandArgs) {
  const rootCommand = commandArgs.find((arg) => !arg.startsWith("-")) ?? "help";
  return ["help", "status", "doctor", "install-status", "skills", "skill", "pi", "update"].includes(rootCommand);
}

function npmViewLatest(timeout) {
  const result = spawnSync("npm", ["view", "pire-browser", "version", "--json"], {
    encoding: "utf8",
    timeout,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    return typeof parsed === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function getUpdateRecommendation({ background }) {
  const currentVersion = packageJson.version;
  if (isOfflineEnv()) {
    return {
      checkedAt: Date.now(),
      available: false,
      kind: "offline",
      currentVersion,
      latestVersion: null,
      offline: true,
    };
  }
  const latest = npmViewLatest(background ? 3_000 : 15_000);
  const checkedAt = Date.now();
  const recommendation = latest
    ? classifyUpdate(currentVersion, latest)
    : { available: false, kind: "unknown", currentVersion, latestVersion: null };
  const update = { checkedAt, ...recommendation };
  writeJson(cachePath(), update);
  return update;
}

export function classifyUpdate(currentVersion, latestVersion) {
  const current = parseSemver(currentVersion);
  const latest = parseSemver(latestVersion);
  if (!current || !latest || compareSemver(latest, current) <= 0) {
    return { available: false, kind: "none", currentVersion, latestVersion };
  }
  const kind = latest.major !== current.major ? "major" : latest.minor !== current.minor ? "minor" : "patch";
  return { available: true, kind, currentVersion, latestVersion };
}

function parseSemver(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(value ?? "");
  return match ? { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) } : null;
}

function compareSemver(left, right) {
  return left.major - right.major || left.minor - right.minor || left.patch - right.patch;
}

function detectInstallKind() {
  if (process.env.PIRE_BROWSER_INSTALL_KIND === "pi") return { kind: "pi" };
  if (process.env.PIRE_BROWSER_INSTALL_KIND === "global") return { kind: "global" };
  const piRoot = process.env.PI_CODING_AGENT_DIR || process.env.PI_HOME;
  if (piRoot && root.startsWith(piRoot)) return { kind: "pi" };
  const globalRoot = spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: process.platform === "win32" });
  if (globalRoot.status === 0 && root.startsWith(globalRoot.stdout.trim())) return { kind: "global" };
  if (root.includes(`${separator()}node_modules${separator()}`)) return { kind: "local" };
  return { kind: "local" };
}

function hasActiveManagedSession() {
  const dir = join(dataDir(), "sessions");
  if (!existsSync(dir)) return false;
  const now = Date.now();
  let names;
  try {
    names = readdirSync(dir).filter((name) => name.endsWith(".json"));
  } catch {
    return true;
  }
  if (names.length > 50) return true;
  for (const name of names.slice(0, 50)) {
    const session = readJson(join(dir, name));
    if (session?.lastHeartbeatAt && now - session.lastHeartbeatAt <= 15_000) return true;
  }
  return false;
}

function dataDir() {
  if (process.platform === "win32") return join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? root, "AppData", "Local"), "pire-browser");
  if (process.platform === "darwin") return join(process.env.HOME ?? root, "Library", "Application Support", "pire-browser");
  return join(process.env.XDG_DATA_HOME ?? join(process.env.HOME ?? root, ".local", "share"), "pire-browser");
}

function updateDir() {
  return join(dataDir(), "updates");
}

function configPath() {
  return join(updateDir(), "config.json");
}

function cachePath() {
  return join(updateDir(), "cache.json");
}

function readUpdateConfig() {
  return { mode: "patch", ...(readJson(configPath()) ?? {}) };
}

function isOfflineEnv(env = process.env) {
  return env.PI_OFFLINE === "1" || isTruthy(env.NPM_CONFIG_OFFLINE) || isTruthy(env.npm_config_offline);
}

function isTruthy(value) {
  return value === "1" || String(value).toLowerCase() === "true";
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function outputUpdate(data, json) {
  if (json) {
    console.log(JSON.stringify({ success: true, data }, null, 2));
  } else {
    console.log(formatUpdatePlain(data));
  }
}

function outputUpdateResult(status, message, json, background, exitCode = 0, details = {}) {
  if (!background) outputUpdate({ status, message, ...details }, json);
  return exitCode;
}

function outputUpdateError(message, json, background) {
  if (!background) {
    if (json) console.log(JSON.stringify({ success: false, error: { code: "invalid_args", message } }, null, 2));
    else console.error(`pire-browser: ${message}`);
  }
  return 2;
}

function removeFlag(values, flag) {
  const index = values.indexOf(flag);
  if (index === -1) return false;
  values.splice(index, 1);
  return true;
}

function removeValueFlag(values, flag) {
  const index = values.indexOf(flag);
  if (index === -1) return null;
  const value = values[index + 1] ?? null;
  values.splice(index, value === null ? 1 : 2);
  return value;
}

function runInstallCommand(command, background) {
  return spawnSync(command[0], command[1], {
    stdio: background ? "pipe" : "inherit",
    encoding: "utf8",
    shell: process.platform === "win32",
  });
}

export function formatUpdatePlain(data) {
  if (data.mode) return `pire-browser update mode set to ${data.mode}.`;
  if (data.update && !data.status) return formatUpdateCheckPlain(data.update);
  if (!data.status) return JSON.stringify(data, null, 2);

  const operation = data.operation === "upgrade" ? "upgrade" : "update";
  const update = data.update ?? {};
  const current = update.currentVersion ?? packageJson.version;
  const latest = update.latestVersion;
  if (data.status === "applied") {
    return latest && current
      ? `pire-browser ${operation === "upgrade" ? "upgraded" : "updated"} ${current} -> ${latest}.`
      : `pire-browser ${operation} applied.`;
  }
  if (data.status === "current") {
    return operation === "upgrade"
      ? `pire-browser ${current} is already current.`
      : `pire-browser update is current. ${current} is installed.`;
  }
  if (data.status === "notify") {
    const next = data.nextAction ? `\nNext: ${data.nextAction}` : "";
    const suffix = latest ? ` Latest is ${latest}; current is ${current}.` : "";
    return `pire-browser ${operation} not applied: ${data.message}.${suffix}${next}`;
  }
  if (data.status === "deferred") {
    const next = data.nextAction ? `\nNext: ${data.nextAction}` : "";
    return `pire-browser ${operation} deferred: ${data.message}.${next}`;
  }
  if (data.status === "offline") {
    return `pire-browser ${operation} skipped: offline mode is enabled. Current version is ${current}.`;
  }
  if (data.status === "unknown") {
    const next = data.nextAction ? `\nNext: ${data.nextAction}` : "";
    return `pire-browser ${operation} could not check the latest version. Current version is ${current}.${next}`;
  }
  if (data.status === "disabled") {
    return `pire-browser update mode is off. Run \`pire-browser update configure --mode patch\` to re-enable checks.`;
  }
  if (data.status === "failed") {
    const next = data.nextAction ? `\nNext: ${data.nextAction}` : "";
    return `pire-browser ${operation} failed: ${data.message}.${next}`;
  }
  return `pire-browser update ${data.status}: ${data.message}`;
}

function formatUpdateCheckPlain(update) {
  const current = update.currentVersion ?? packageJson.version;
  if (update.kind === "offline") return `pire-browser update check skipped: offline mode is enabled. Current version is ${current}.`;
  if (update.kind === "unknown") return `pire-browser update check could not reach the npm registry. Current version is ${current}.`;
  if (!update.available) return `pire-browser ${current} is already current.`;
  return `pire-browser ${update.latestVersion} is available (${update.kind}); current is ${current}.\nRun \`pire-browser upgrade\` to update.`;
}

function localInstallUpgradeHint(latestVersion) {
  const suffix = latestVersion ? `@${latestVersion}` : "@latest";
  return `Run \`npm install pire-browser${suffix} --include=optional\` in the project, or install globally with \`npm install -g pire-browser --include=optional\`.`;
}

function installFailureHint(installKind, latestVersion) {
  if (installKind.kind === "pi") return "Run `pi update npm:pire-browser`, then restart Pi.";
  if (installKind.kind === "global") {
    const suffix = latestVersion ? `@${latestVersion}` : "@latest";
    return `Run \`npm install -g pire-browser${suffix} --include=optional\`.`;
  }
  return localInstallUpgradeHint(latestVersion);
}

function formatCommand(command) {
  return [command[0], ...command[1]].join(" ");
}

function isLockLikeFailure(result) {
  if (process.platform !== "win32") return false;
  const text = `${result.error?.code ?? ""}\n${result.error?.message ?? ""}\n${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  return /EPERM|EBUSY|EACCES|access is denied|file is being used|being used by another process/i.test(text);
}

function sleep(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function spawnDetached(command, commandArgs) {
  const child = spawn(command, commandArgs, { detached: true, stdio: "ignore", windowsHide: true });
  child.unref();
}

function separator() {
  return process.platform === "win32" ? "\\" : "/";
}

export function isEntrypoint(argvPath = process.argv[1], moduleUrl = import.meta.url) {
  if (!argvPath) return false;
  const modulePath = typeof moduleUrl === "string" && moduleUrl.startsWith("file:")
    ? fileURLToPath(moduleUrl)
    : moduleUrl;
  const canonicalModule = canonicalEntrypointPath(modulePath);
  const canonicalArgv = canonicalEntrypointPath(argvPath);
  return canonicalModule === canonicalArgv || isNpmBinShimEntrypoint(canonicalArgv, canonicalModule);
}

function canonicalEntrypointPath(path) {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function isNpmBinShimEntrypoint(argvPath, modulePath) {
  if (basename(modulePath) !== "pire-browser.js") return false;
  const binDir = dirname(modulePath);
  if (basename(binDir) !== "bin") return false;
  const packageRoot = dirname(binDir);
  if (!isPireBrowserPackageRoot(packageRoot)) return false;

  const nodeModulesDir = dirname(packageRoot);
  const candidates = [
    join(nodeModulesDir, ".bin", "pire-browser"),
    join(nodeModulesDir, ".bin", "pire-browser.cmd"),
    join(nodeModulesDir, ".bin", "pire-browser.ps1"),
  ];

  const maybeLibDir = dirname(nodeModulesDir);
  if (basename(nodeModulesDir) === "node_modules" && basename(maybeLibDir) === "lib") {
    candidates.push(join(dirname(maybeLibDir), "bin", "pire-browser"));
  }

  return candidates.some((candidate) => canonicalEntrypointPath(candidate) === argvPath);
}

function isPireBrowserPackageRoot(packageRoot) {
  try {
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    return packageJson?.name === "pire-browser";
  } catch {
    return false;
  }
}
