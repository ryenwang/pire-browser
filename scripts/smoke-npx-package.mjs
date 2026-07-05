#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlatform } from "./build-platform.mjs";
import { stagePlatformPackage } from "./package-platform.mjs";
import { PLATFORM_PACKAGES, platformTuple, rootDir, rootPackageJson, tarballNameForPackage } from "./platform.mjs";

const root = rootDir();

export function parseNpxPackageSmokeArgs(argv, defaults = {}) {
  const platform = defaults.platform ?? process.platform;
  const arch = defaults.arch ?? process.arch;
  const options = {
    tuple: null,
    buildPlatform: false,
    packDir: join(root, "target", "npx-package-smoke", "npm"),
    artifactDir: join(root, "target", "npx-package-smoke", "artifacts"),
    keep: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tuple") {
      options.tuple = requiredValue(argv, ++i, arg);
    } else if (arg === "--build-platform") {
      options.buildPlatform = true;
    } else if (arg === "--pack-dir") {
      options.packDir = resolve(requiredValue(argv, ++i, arg));
    } else if (arg === "--artifact-dir") {
      options.artifactDir = resolve(requiredValue(argv, ++i, arg));
    } else if (arg === "--keep") {
      options.keep = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.tuple) options.tuple = platformTuple(platform, arch);
  if (!PLATFORM_PACKAGES[options.tuple]) throw new Error(`Unsupported tuple: ${options.tuple}`);
  options.packDir = resolve(options.packDir);
  options.artifactDir = resolve(options.artifactDir);
  return options;
}

function requiredValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

export function npxSmokeEnv(baseEnv = process.env) {
  const env = {
    ...baseEnv,
    PIRE_BROWSER_DISABLE_UPDATE_CHECK: "1",
    PIRE_BROWSER_SKIP_POSTINSTALL: "1",
    PI_OFFLINE: "1",
  };
  delete env.PIRE_BROWSER_BINARY;
  delete env.PIRE_BROWSER_EXE;
  return env;
}

export function npxPackageCommandArgs({ rootTarball, platformTarball, commandArgs = [] }) {
  return [
    "exec",
    "--yes",
    "--package",
    rootTarball,
    "--package",
    platformTarball,
    "--",
    "pire-browser",
    ...commandArgs,
  ];
}

export function validateNpxSmokeOutputs({ versionStdout, helpStdout, skillsStdout, expectedVersion }) {
  if (!versionStdout.includes(expectedVersion)) {
    throw new Error(`npx smoke version output did not include ${expectedVersion}: ${versionStdout}`);
  }
  if (!helpStdout.includes("pire-browser window switch <wN>") || !helpStdout.includes("pire-browser window close [wN]")) {
    throw new Error("npx smoke native help did not include window lifecycle commands");
  }
  const parsed = JSON.parse(skillsStdout);
  if (!parsed.success || parsed.data?.skill?.name !== "core") {
    throw new Error("npx smoke skills command did not return the core skill JSON envelope");
  }
  if (!String(parsed.data.skill.content ?? "").includes("pire-browser snapshot -i")) {
    throw new Error("npx smoke core skill content did not include the inspect workflow");
  }
  return {
    version: expectedVersion,
    helpChecked: true,
    skill: parsed.data.skill.name,
  };
}

export function npmCommand(platform = process.platform) {
  return platform === "win32" ? "npm.cmd" : "npm";
}

export function runNpxPackageSmoke(options) {
  const packageJson = rootPackageJson(root);
  const workRoot = mkdtempSync(join(tmpdir(), "pire-browser-npx-smoke-"));
  const artifactDir = options.artifactDir;
  mkdirSync(options.packDir, { recursive: true });
  mkdirSync(artifactDir, { recursive: true });

  const summary = {
    success: false,
    tuple: options.tuple,
    version: packageJson.version,
    workRoot,
    packDir: options.packDir,
    artifactDir,
    buildPlatform: options.buildPlatform,
    steps: [],
  };

  try {
    if (options.buildPlatform) {
      const build = buildPlatform(options.tuple);
      summary.steps.push({ name: "build-platform", tuple: options.tuple, target: build.target, status: 0 });
    }
    const rootTarball = packRoot(options.packDir, workRoot, artifactDir, summary);
    const platformTarball = packPlatform(options.tuple, options.packDir);
    summary.rootTarball = rootTarball;
    summary.platformTarball = platformTarball;

    const env = npxSmokeEnv(process.env);
    const version = runStep("npx-version", npxPackageCommandArgs({ rootTarball, platformTarball, commandArgs: ["--version"] }), {
      cwd: workRoot,
      env,
      artifactDir,
      summary,
    });
    const help = runStep("npx-help-window", npxPackageCommandArgs({ rootTarball, platformTarball, commandArgs: ["help", "window"] }), {
      cwd: workRoot,
      env,
      artifactDir,
      summary,
    });
    const skills = runStep(
      "npx-skills-core",
      npxPackageCommandArgs({ rootTarball, platformTarball, commandArgs: ["skills", "get", "core", "--json"] }),
      { cwd: workRoot, env, artifactDir, summary }
    );

    summary.validation = validateNpxSmokeOutputs({
      versionStdout: version.stdout,
      helpStdout: help.stdout,
      skillsStdout: skills.stdout,
      expectedVersion: packageJson.version,
    });
    summary.success = true;
    writeFileSync(join(artifactDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    console.log(`npx package smoke passed: ${workRoot}`);
    return summary;
  } finally {
    writeFileSync(join(artifactDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
    if (!options.keep) rmSync(workRoot, { recursive: true, force: true });
  }
}

function packRoot(packDir, cwd, artifactDir, summary) {
  const result = runChecked("pack-root", npmCommand(), ["pack", "--pack-destination", packDir, "--json"], {
    cwd: root,
    artifactDir,
    summary,
  });
  const [packed] = JSON.parse(result.stdout);
  return join(packDir, packed.filename);
}

function packPlatform(tuple, packDir) {
  stagePlatformPackage(tuple, { pack: true, packDestination: packDir });
  const packageName = PLATFORM_PACKAGES[tuple];
  return join(packDir, tarballNameForPackage(packageName, rootPackageJson(root).version));
}

function runStep(name, args, options) {
  return runChecked(name, npmCommand(), args, options);
}

function runChecked(name, command, args, { cwd, env = process.env, artifactDir, summary }) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const status = result.status ?? (result.error ? 1 : 0);
  writeFileSync(join(artifactDir, `${name}.stdout.log`), stdout);
  writeFileSync(join(artifactDir, `${name}.stderr.log`), stderr);
  summary.steps.push({ name, command, args, status });
  if (result.error) throw new Error(`${name} failed to start: ${result.error.message}`);
  if (status !== 0) throw new Error(`${name} exited with ${status}; see ${artifactDir}`);
  return { stdout, stderr, status };
}

function main(argv) {
  try {
    runNpxPackageSmoke(parseNpxPackageSmokeArgs(argv));
    return 0;
  } catch (error) {
    console.error(error.message);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
