#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PLATFORM_PACKAGES, rootDir } from "./platform.mjs";

export const TRUSTED_PUBLISH_WORKFLOW = "npm-publish.yml";
export const TRUSTED_PUBLISH_ENVIRONMENT = "npm-production";
export const TRUSTED_PUBLISH_REPOSITORY = "ryenwang/pire-browser";

const root = rootDir();

export function trustedPublisherPackages(rootPackage) {
  return [rootPackage.name, ...Object.values(PLATFORM_PACKAGES)];
}

export function trustCommand(packageName, options = {}) {
  return [
    "npm",
    "trust",
    "github",
    packageName,
    "--repo",
    options.repository ?? TRUSTED_PUBLISH_REPOSITORY,
    "--file",
    options.workflow ?? TRUSTED_PUBLISH_WORKFLOW,
    "--env",
    options.environment ?? TRUSTED_PUBLISH_ENVIRONMENT,
    "--allow-publish",
    "--yes",
  ];
}

export function trustCommands(rootPackage, options = {}) {
  return trustedPublisherPackages(rootPackage).map((packageName) => trustCommand(packageName, options));
}

export function renderTrustSetup(rootPackage, options = {}) {
  const commands = trustCommands(rootPackage, options);
  return [
    "# One-time npm trusted publishing setup",
    "# Requires npm@11.10.0+, npm package write access, and account-level 2FA.",
    "npm install -g npm@^11.10.0",
    ...commands.map((command) => command.map(quoteShellArg).join(" ")),
    "",
    `# Configure each package to trust .github/workflows/${options.workflow ?? TRUSTED_PUBLISH_WORKFLOW}`,
    `# Repository: ${options.repository ?? TRUSTED_PUBLISH_REPOSITORY}`,
    `# GitHub environment: ${options.environment ?? TRUSTED_PUBLISH_ENVIRONMENT}`,
  ].join("\n");
}

function quoteShellArg(value) {
  return /^[A-Za-z0-9_./:@-]+$/.test(value) ? value : JSON.stringify(value);
}

function main() {
  const rootPackage = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  console.log(renderTrustSetup(rootPackage));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
