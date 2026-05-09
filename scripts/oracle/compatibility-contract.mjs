import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

export const COMPATIBILITY_STATUSES = ["exact", "best_effort", "not_available"];
export const COMPATIBILITY_DISPOSITIONS = [
  "temporary_gap",
  "permanent_firefox_gap",
  "backend_specific",
  "intentionally_different",
  "not_started",
];
export const COVERAGE_STATES = ["covered", "uncovered", "not_comparable", "smoke_only"];
export const COMPATIBILITY_OWNER_EPICS = ["Epic 1", "Epic 2", "Epic 3", "Epic 4", "Epic 5", "Epic 6", "Epic 7", "Epic 8"];
export const GLOBAL_FLAG_BEHAVIORS = ["honored", "ignored_with_warning", "deferred", "rejected"];
export const CONTRACT_DOC_FILES = [
  "01-introduction.md",
  "02-installation.md",
  "03-quick-start.md",
  "04-skills.md",
  "05-commands.md",
  "06-configuration.md",
  "07-selectors.md",
  "08-snapshots.md",
  "09-sessions.md",
  "10-dashboard.md",
  "11-diffing.md",
  "12-cdp-mode.md",
  "13-streaming.md",
  "14-profiler.md",
  "15-ios.md",
  "16-security.md",
  "17-next.md",
  "18-native-mode.md",
  "19-providers-agentcore.md",
  "20-providers-browser-use.md",
  "21-providers-browserbase.md",
  "22-providers-browserless.md",
  "23-providers-kernel.md",
  "24-engines-chrome.md",
  "25-engines-lightpanda.md",
];
export const CONTRACT_DOC_EXCLUDED_FILES = ["26-changelog.md"];

const BOILERPLATE_RATIONALE_PREFIXES = [
  "Migrated schema v2 compatibility claim:",
  "Mirrored checklist inventory item with source status",
];
const BOILERPLATE_CONTRACT_TEXT = new Set([
  "Semantic parity after documented normalization.",
  "Useful Firefox/WebExtension result with documented limitation warning.",
  "Stable unsupported-feature message; exact prose may vary after normalization.",
]);
const STATUS_SORT = new Map([
  ["exact", 0],
  ["best_effort", 1],
  ["not_available", 2],
]);
const SUPPORTED_ROOT_DENYLIST = new Set(["open", "goto", "navigate", "click", "fill", "snapshot", "tab", "tabs", "find", "wait"]);
const DOCUMENTED_GLOBAL_FLAGS = new Set([
  "--json",
  "--session",
  "--session-name",
  "--profile",
  "--state",
  "--headed",
  "--headless",
  "--color-scheme",
  "--max-output",
  "--content-boundaries",
  "--allowed-domains",
  "--confirm-actions",
  "--action-policy",
  "--config",
  "--executable-path",
  "--engine",
  "--provider",
  "-p",
  "--model",
  "--allow-file-access",
  "--auto-connect",
  "--confirm-interactive",
  "-q",
  "-v",
]);
const EPIC2_NEGATIVE_PATH_KEYS = ["bad_selector", "stale_ref", "ambiguous_selector", "disabled_target", "short_timeout"];

export function compatibilityItems(compatibility) {
  if (compatibility?.schemaVersion === 3) return compatibility.items ?? [];
  return Object.entries(compatibility?.statuses ?? {}).flatMap(([status, ids]) =>
    (ids ?? []).map((id) => ({
      id,
      status,
      disposition: status === "not_available" ? "not_started" : "temporary_gap",
      coverage: normalizeCoverageRecord(compatibility?.oracleCoverage?.[id]),
    }))
  );
}

export function compatibilityStatusEntries(compatibility) {
  return compatibilityItems(compatibility).map((item) => ({ id: item.id, status: item.status }));
}

export function compatibilityCoverageMap(compatibility) {
  return Object.fromEntries(
    compatibilityItems(compatibility).map((item) => [item.id, normalizeCoverageRecord(item.coverage)])
  );
}

export function reviewQueueItems(items) {
  return [...items]
    .filter((item) => item.contractReviewed !== true)
    .sort(compareCompatibilityItems);
}

export function reviewQueueSummary(items) {
  const groups = new Map();
  for (const item of reviewQueueItems(items)) {
    const key = `${item.ownerEpic ?? "Unassigned"}|${item.status ?? "missing"}|${item.disposition ?? "missing"}`;
    const group = groups.get(key) ?? {
      ownerEpic: item.ownerEpic ?? "Unassigned",
      status: item.status ?? "missing",
      disposition: item.disposition ?? "missing",
      count: 0,
    };
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups.values()].sort(compareReviewGroups);
}

export function canonicalLinkRecords(items) {
  const itemById = new Map(items.map((item) => [item.id, item]));
  return items
    .filter((item) => item.canonicalItemId)
    .map((item) => ({
      id: item.id,
      canonicalItemId: item.canonicalItemId,
      status: item.status,
      ownerEpic: item.ownerEpic,
      canonicalStatus: itemById.get(item.canonicalItemId)?.status ?? null,
    }))
    .sort((left, right) => left.canonicalItemId.localeCompare(right.canonicalItemId) || left.id.localeCompare(right.id));
}

export function canonicalLinkCandidateRecords(items) {
  const canonicalTargets = items
    .filter((item) => item.id?.startsWith("cmd-"))
    .filter((item) => item.contractReviewed === true)
    .filter((item) => normalizeCoverageState(item.coverage?.state) === "covered")
    .filter((item) => !item.canonicalItemId);
  const candidates = [];

  for (const item of items) {
    if (!item.id?.startsWith("doc-")) continue;
    if (item.canonicalItemId) continue;
    const root = item.command?.primary;
    if (!root) continue;
    if (isUnsafeCanonicalCandidateText(item)) continue;

    const matches = canonicalTargets.filter(
      (canonical) => item.status === canonical.status && isCommandCompatibleWithCanonical(item, canonical)
    );
    if (matches.length !== 1) continue;
    const canonical = matches[0];
    candidates.push({
      id: item.id,
      canonicalItemId: canonical.id,
      commandRoot: root,
      status: item.status,
      ownerEpic: item.ownerEpic,
      sourcePath: item.source?.path ?? null,
    });
  }

  return candidates.sort(
    (left, right) =>
      compareEpicNames(left.ownerEpic, right.ownerEpic) ||
      left.canonicalItemId.localeCompare(right.canonicalItemId) ||
      left.id.localeCompare(right.id)
  );
}

export function unsupportedRootProvenance(items) {
  const roots = new Map();
  for (const item of items) {
    for (const root of itemUnsupportedRoots(item)) {
      const record = roots.get(root) ?? {
        root,
        itemIds: [],
        ownerEpics: [],
        dispositions: [],
        sourcePaths: [],
      };
      pushUnique(record.itemIds, item.id);
      pushUnique(record.ownerEpics, item.ownerEpic);
      pushUnique(record.dispositions, item.disposition);
      pushUnique(record.sourcePaths, item.source?.path);
      roots.set(root, record);
    }
  }
  return [...roots.values()]
    .map((record) => ({
      ...record,
      itemIds: record.itemIds.sort(),
      ownerEpics: record.ownerEpics.sort(compareEpicNames),
      dispositions: record.dispositions.sort(),
      sourcePaths: record.sourcePaths.sort(),
    }))
    .sort((left, right) => left.root.localeCompare(right.root));
}

export function buildDocsManifest(
  compatibility,
  {
    docsRoot,
    compatibilityMatrixPath = "docs/agent-browser-compatibility.json",
    docsRootPath = "docs/feature-parity/agent-browser",
  } = {}
) {
  if (!docsRoot) throw new Error("docsRoot is required to build the docs manifest");
  return {
    schemaVersion: 1,
    source: {
      compatibilityMatrix: normalizeSlash(compatibilityMatrixPath),
      docsRoot: normalizeSlash(docsRootPath),
      package: compatibility.source?.package ?? null,
      version: compatibility.source?.version ?? null,
      sourceCommit: compatibility.source?.sourceCommit ?? null,
    },
    algorithm: "sha256",
    lineEndings: "lf-normalized",
    excludedFiles: [...CONTRACT_DOC_EXCLUDED_FILES].sort(),
    files: CONTRACT_DOC_FILES.map((path) => docsManifestFileRecord(docsRoot, path)),
  };
}

export function normalizeDocsManifestContent(text) {
  return String(text ?? "").replace(/\r\n?/g, "\n");
}

export function validateCompatibilityContract(
  compatibility,
  { cases = [], docsRoot, baseline, compatibilityBaseline, unsupportedRoots, docsManifest } = {}
) {
  const failures = [];
  const warnings = [];
  const items = compatibilityItems(compatibility);
  const ids = new Set();
  const itemById = new Map();
  const caseById = new Map(cases.map((testCase) => [testCase.id, testCase]));

  if (compatibility?.schemaVersion !== 3) failures.push("compatibility matrix must use schemaVersion 3");
  validateSourcePins(compatibility, baseline, failures);

  for (const item of items) {
    validateItem(item, failures, { caseById });
    if (ids.has(item.id)) failures.push(`duplicate compatibility item id: ${item.id}`);
    ids.add(item.id);
    itemById.set(item.id, item);
    if (item.id?.startsWith("doc-changelog-")) failures.push(`changelog item is not part of the contract inventory: ${item.id}`);
  }

  const fixtureIds = fixtureCompatibilityIds(cases);
  const fixtureTapeCoveredIds = fixtureTapeCoveredCompatibilityIds(cases);
  for (const id of fixtureIds) {
    if (!ids.has(id)) failures.push(`fixture references unknown compatibility item id: ${id}`);
  }
  validateCanonicalLinks(items, itemById, fixtureTapeCoveredIds, failures);
  validateAliasCoverage(items, caseById, failures);
  validateWarningCoverage(items, itemById, caseById, failures);
  validateSeparateBaseline(compatibility, compatibilityBaseline, itemById, failures);
  validateUnsupportedRoots(unsupportedRoots, items, failures);
  validateGlobalFlagPolicy(compatibility, items, failures);
  validateEpic2ReadinessPolicy(compatibility, items, caseById, failures);

  if (docsRoot) {
    validateContractDocInventory(docsRoot, items, failures);
    validateDocsManifest(docsRoot, docsManifest, compatibility, failures);
    const documented = loadDocumentedChecklistItemsSync(docsRoot);
    const documentedKeys = new Set(documented.map(documentedItemKey));
    const matrixKeys = new Set(
      items
        .flatMap((item) => [item.source, ...(item.documentedItems ?? [])])
        .filter(Boolean)
        .map(documentedItemKey)
    );
    for (const documentedItem of documented) {
      const key = documentedItemKey(documentedItem);
      if (!matrixKeys.has(key)) failures.push(`documented checklist item missing from matrix: ${key}`);
    }
    for (const item of items) {
      for (const source of [item.source, ...(item.documentedItems ?? [])].filter(Boolean)) {
        if (source.kind && source.kind !== "docs") continue;
        if (!source.path || !source.anchor || !source.heading) continue;
        const resolved = resolveSourceAnchor(docsRoot, source);
        if (!resolved) failures.push(`source anchor does not resolve for ${item.id}: ${source.path}#${source.anchor}`);
      }
    }
  }

  const coverageStates = countBy(items, (item) => normalizeCoverageState(item.coverage?.state ?? "uncovered"));
  const statusCounts = countBy(items, (item) => item.status ?? "missing");

  return {
    pass: failures.length === 0,
    failures,
    warnings,
    stats: {
      items: items.length,
      fixtureReferences: fixtureIds.size,
      statuses: statusCounts,
      coverageStates,
    },
  };
}

function validateGlobalFlagPolicy(compatibility, items, failures) {
  const policy = compatibility?.globalFlagPolicy;
  const reviewedGlobalFlags = new Map();
  for (const item of items) {
    if (item.contractReviewed !== true) continue;
    for (const flag of itemDocumentedFlags(item)) {
      if (!DOCUMENTED_GLOBAL_FLAGS.has(flag)) continue;
      const users = reviewedGlobalFlags.get(flag) ?? [];
      users.push(item.id);
      reviewedGlobalFlags.set(flag, users);
    }
  }
  if (!policy) {
    if (reviewedGlobalFlags.size > 0) failures.push("globalFlagPolicy is required when reviewed rows document global flags");
    return;
  }
  for (const [flag, entry] of Object.entries(policy)) {
    if (!DOCUMENTED_GLOBAL_FLAGS.has(flag)) failures.push(`globalFlagPolicy contains unknown global flag: ${flag}`);
    if (!GLOBAL_FLAG_BEHAVIORS.includes(entry?.behavior)) {
      failures.push(`globalFlagPolicy.${flag}.behavior must be one of ${GLOBAL_FLAG_BEHAVIORS.join(", ")}`);
    }
    if (entry?.behavior === "ignored_with_warning" && entry.warningCode !== "IGNORED_GLOBAL_FLAG") {
      failures.push(`globalFlagPolicy.${flag} ignored_with_warning entries must use warningCode IGNORED_GLOBAL_FLAG`);
    }
  }
  for (const [flag, itemIds] of reviewedGlobalFlags) {
    if (!policy[flag]) failures.push(`reviewed global flag ${flag} is not classified in globalFlagPolicy; used by ${itemIds.join(", ")}`);
  }
}

function validateEpic2ReadinessPolicy(compatibility, items, caseById, failures) {
  const policy = compatibility?.coveragePolicy?.epic2Readiness;
  if (!policy) return;
  const negativeCases = policy.negativePathCases ?? {};
  for (const key of EPIC2_NEGATIVE_PATH_KEYS) {
    const caseId = negativeCases[key];
    const testCase = caseById.get(caseId);
    if (!caseId) {
      failures.push(`coveragePolicy.epic2Readiness.negativePathCases.${key} is required`);
      continue;
    }
    if (!testCase) {
      failures.push(`Epic 2 negative-path case ${key} references unknown case ${caseId}`);
      continue;
    }
    if (testCase.status !== "error") failures.push(`Epic 2 negative-path case ${caseId} must use status error`);
    if (!caseHasAssertion(testCase, "jsonEnvelopeShape")) failures.push(`Epic 2 negative-path case ${caseId} needs jsonEnvelopeShape`);
    if (!caseHasAssertion(testCase, "exitCodeEquals") && !caseHasAssertion(testCase, "exitCodeNonZero")) {
      failures.push(`Epic 2 negative-path case ${caseId} needs an exit-code assertion`);
    }
  }

  for (const [kind, caseId] of Object.entries(policy.strictJsonCases ?? {})) {
    const testCase = caseById.get(caseId);
    if (!testCase) {
      failures.push(`Epic 2 strict JSON ${kind} case references unknown case ${caseId}`);
      continue;
    }
    if (!caseHasAssertion(testCase, "jsonEnvelopeShape")) failures.push(`Epic 2 strict JSON ${kind} case ${caseId} needs jsonEnvelopeShape`);
  }

  for (const item of items) {
    const text = itemSearchText(item);
    if (item.command?.primary === "upload" || /\bagent-browser\s+upload\b/i.test(text)) {
      if (item.ownerEpic !== "Epic 8") failures.push(`upload compatibility item ${item.id} must be owned by Epic 8`);
      if (item.disposition !== "backend_specific") failures.push(`upload compatibility item ${item.id} must use backend_specific disposition`);
    }
    if (/networkidle|network idle/i.test(text) && item.ownerEpic !== "Epic 5") {
      failures.push(`network-idle compatibility item ${item.id} must be owned by Epic 5`);
    }
  }
}

export async function loadDocumentedChecklistItems(docsRoot) {
  const files = (await readdir(docsRoot, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && CONTRACT_DOC_FILES.includes(entry.name))
    .map((entry) => join(docsRoot, entry.name))
    .sort();
  return files.flatMap((file) => loadDocumentedChecklistItemsFromFile(docsRoot, file));
}

export function loadDocumentedChecklistItemsSync(docsRoot) {
  const entries = readDirSyncSorted(docsRoot);
  return entries
    .filter((entry) => CONTRACT_DOC_FILES.includes(entry))
    .flatMap((entry) => loadDocumentedChecklistItemsFromFile(docsRoot, join(docsRoot, entry)));
}

export function documentedItemKey(item) {
  return `${normalizeSlash(item.path)}#${item.anchor}#${item.checklist}`;
}

export function normalizeCoverageState(state) {
  if (state === "not-comparable") return "not_comparable";
  if (state === "smoke-only") return "smoke_only";
  return state;
}

export function githubHeadingAnchor(heading) {
  return String(heading ?? "")
    .trim()
    .toLowerCase()
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function validateSourcePins(compatibility, baseline, failures) {
  const source = compatibility?.source ?? {};
  if (source.package !== "agent-browser") failures.push("source.package must be agent-browser");
  if (baseline?.agentBrowser) {
    if (source.version !== baseline.agentBrowser.version) {
      failures.push(`source.version ${source.version ?? "(missing)"} does not match baseline ${baseline.agentBrowser.version}`);
    }
    if (source.sourceCommit !== baseline.agentBrowser.sourceCommit) {
      failures.push("source.sourceCommit does not match baseline metadata");
    }
  }
  if (!source.capturedAt) failures.push("source.capturedAt is required");
  if (!source.refreshProcess) failures.push("source.refreshProcess is required");
}

function validateItem(item, failures, { caseById }) {
  if (!item.id || typeof item.id !== "string") failures.push("compatibility item needs a string id");
  if (item.id && !/^[a-z][a-z0-9-]*$/.test(item.id)) failures.push(`compatibility item id must be a stable slug: ${item.id}`);
  if (!COMPATIBILITY_STATUSES.includes(item.status)) failures.push(`unknown status for ${item.id}: ${item.status}`);
  if (!COMPATIBILITY_DISPOSITIONS.includes(item.disposition)) failures.push(`unknown disposition for ${item.id}: ${item.disposition}`);
  if (typeof item.contractReviewed !== "boolean") failures.push(`contractReviewed boolean is required for ${item.id}`);
  if (!item.ownerEpic) failures.push(`ownerEpic is required for ${item.id}`);
  else if (!COMPATIBILITY_OWNER_EPICS.includes(item.ownerEpic)) {
    failures.push(`ownerEpic for ${item.id} must be one of ${COMPATIBILITY_OWNER_EPICS.join(", ")}: ${item.ownerEpic}`);
  }
  if (!item.rationale) failures.push(`rationale is required for ${item.id}`);
  if (!item.source) failures.push(`source is required for ${item.id}`);
  if (!item.contracts) failures.push(`contracts are required for ${item.id}`);
  if (item.contracts && typeof item.contracts.warningsContractual !== "boolean") {
    failures.push(`contracts.warningsContractual boolean is required for ${item.id}`);
  }
  if (!item.coverage) failures.push(`coverage is required for ${item.id}`);
  const state = normalizeCoverageState(item.coverage?.state);
  if (!COVERAGE_STATES.includes(state)) failures.push(`unknown coverage state for ${item.id}: ${item.coverage?.state}`);
  if (state === "covered" && item.contractReviewed !== true) failures.push(`covered item ${item.id} must have contractReviewed=true`);
  if (item.contractReviewed === true && hasBoilerplateReview(item)) failures.push(`reviewed item ${item.id} still uses boilerplate rationale or contract text`);
  if (item.status === "best_effort" && !Array.isArray(item.limitations)) {
    failures.push(`best_effort item ${item.id} requires limitations`);
  }
  if (Array.isArray(item.aliases)) {
    for (const alias of item.aliases) {
      if (!alias.name) failures.push(`alias entry on ${item.id} needs name`);
      if (typeof alias.parserCovered !== "boolean") failures.push(`alias ${alias.name ?? "(missing)"} on ${item.id} needs parserCovered boolean`);
      if (alias.parserCovered && (!Array.isArray(alias.cases) || alias.cases.length === 0)) {
        failures.push(`alias ${alias.name ?? "(missing)"} on ${item.id} needs covering cases`);
      }
      for (const caseId of alias.cases ?? []) {
        if (!caseById.has(caseId)) failures.push(`alias ${alias.name ?? "(missing)"} on ${item.id} references unknown case ${caseId}`);
      }
    }
  }
}

export function hasBoilerplateReview(item) {
  const rationale = String(item.rationale ?? "");
  if (BOILERPLATE_RATIONALE_PREFIXES.some((prefix) => rationale.startsWith(prefix))) return true;
  return BOILERPLATE_CONTRACT_TEXT.has(String(item.contracts?.text ?? ""));
}

function validateContractDocInventory(docsRoot, items, failures) {
  const entries = readDirSyncSorted(docsRoot);
  const numberedDocs = entries.filter((entry) => /^\d{2}-.+\.md$/.test(entry));
  if (numberedDocs.length === 0) return;

  const allowed = new Set(CONTRACT_DOC_FILES);
  const excluded = new Set(CONTRACT_DOC_EXCLUDED_FILES);
  const available = new Set(entries);
  for (const file of CONTRACT_DOC_FILES) {
    if (!available.has(file)) failures.push(`allowlisted contract doc is missing: ${file}`);
  }
  for (const file of numberedDocs) {
    if (!allowed.has(file) && !excluded.has(file)) {
      failures.push(`contract doc file must be allowlisted or excluded: ${file}`);
    }
  }
  for (const item of items) {
    for (const source of [item.source, ...(item.documentedItems ?? [])].filter(Boolean)) {
      if (excluded.has(source.path)) failures.push(`excluded contract doc must not generate matrix rows: ${item.id} from ${source.path}`);
    }
  }
}

function validateDocsManifest(docsRoot, manifest, compatibility, failures) {
  const entries = readDirSyncSorted(docsRoot);
  const numberedDocs = entries.filter((entry) => /^\d{2}-.+\.md$/.test(entry));
  if (numberedDocs.length === 0 && !manifest) return;
  if (!manifest) {
    failures.push("docs manifest is required for the contract docs mirror");
    return;
  }

  if (manifest.schemaVersion !== 1) failures.push("docs manifest must use schemaVersion 1");
  if (manifest.algorithm !== "sha256") failures.push("docs manifest algorithm must be sha256");
  if (manifest.lineEndings !== "lf-normalized") failures.push("docs manifest lineEndings must be lf-normalized");
  if (manifest.source?.package !== compatibility.source?.package) failures.push("docs manifest source.package does not match compatibility source");
  if (manifest.source?.version !== compatibility.source?.version) failures.push("docs manifest source.version does not match compatibility source");
  if (manifest.source?.sourceCommit !== compatibility.source?.sourceCommit) {
    failures.push("docs manifest source.sourceCommit does not match compatibility source");
  }

  const expectedExcluded = [...CONTRACT_DOC_EXCLUDED_FILES].sort();
  if (JSON.stringify(manifest.excludedFiles ?? []) !== JSON.stringify(expectedExcluded)) {
    failures.push("docs manifest excludedFiles must match the contract excluded docs");
  }

  const expected = buildDocsManifest(compatibility, { docsRoot });
  const expectedByPath = new Map(expected.files.map((file) => [file.path, file]));
  const seen = new Set();
  const manifestPaths = (manifest.files ?? []).map((file) => file.path).filter(Boolean);
  if (JSON.stringify(manifestPaths) !== JSON.stringify([...manifestPaths].sort())) {
    failures.push("docs manifest files must be sorted by path");
  }
  for (const file of manifest.files ?? []) {
    if (!file.path) {
      failures.push("docs manifest file entry needs path");
      continue;
    }
    if (seen.has(file.path)) failures.push(`docs manifest has duplicate file entry: ${file.path}`);
    seen.add(file.path);
    if (CONTRACT_DOC_EXCLUDED_FILES.includes(file.path)) {
      failures.push(`docs manifest must not include excluded doc: ${file.path}`);
    }
    const expectedFile = expectedByPath.get(file.path);
    if (!expectedFile) {
      failures.push(`docs manifest includes non-contract doc: ${file.path}`);
      continue;
    }
    if (file.sha256 !== expectedFile.sha256) failures.push(`docs manifest hash is stale for ${file.path}`);
    if (file.normalizedBytes !== expectedFile.normalizedBytes) {
      failures.push(`docs manifest byte count is stale for ${file.path}`);
    }
  }
  for (const expectedFile of expected.files) {
    if (!seen.has(expectedFile.path)) failures.push(`docs manifest missing contract doc: ${expectedFile.path}`);
  }
}

function validateAliasCoverage(items, caseById, failures) {
  for (const item of items) {
    for (const alias of item.aliases ?? []) {
      if (!alias.parserCovered) continue;
      for (const caseId of alias.cases ?? []) {
        const testCase = caseById.get(caseId);
        if (!testCase) continue;
        const coversItem = (testCase.compatibilityItems ?? []).some((compatibilityItem) => compatibilityItem.id === item.id);
        if (!coversItem) failures.push(`alias ${alias.name} on ${item.id} references ${caseId}, but that case does not cover the item`);
        const invokesAlias = (testCase.steps ?? []).some((step) => commandStartsWith(step.command, alias.name));
        if (!invokesAlias) failures.push(`alias ${alias.name} on ${item.id} references ${caseId}, but no step invokes that alias`);
      }
    }
  }
}

function validateCanonicalLinks(items, itemById, fixtureTapeCoveredIds, failures) {
  for (const item of items) {
    if (!item.canonicalItemId) continue;
    if (!item.id?.startsWith("doc-")) failures.push(`canonicalItemId is only allowed on doc rows: ${item.id}`);
    const canonical = itemById.get(item.canonicalItemId);
    if (!canonical) {
      failures.push(`canonicalItemId for ${item.id} does not resolve: ${item.canonicalItemId}`);
      continue;
    }
    if (!canonical.id?.startsWith("cmd-")) failures.push(`canonicalItemId for ${item.id} must point to a cmd-* item`);
    if (canonical.canonicalItemId) failures.push(`canonical item ${canonical.id} for ${item.id} must not itself be canonical-linked`);
    if (item.status !== canonical.status) failures.push(`canonical-linked item ${item.id} status ${item.status} differs from ${canonical.id} status ${canonical.status}`);
    if (!isCommandCompatibleWithCanonical(item, canonical)) {
      failures.push(`canonical-linked item ${item.id} command root is not compatible with ${canonical.id}`);
    }
    const itemState = normalizeCoverageState(item.coverage?.state);
    const directFixtureCovered = fixtureTapeCoveredIds.has(item.id);
    if (itemState === "covered" && !directFixtureCovered) {
      if (item.contractReviewed !== true) failures.push(`canonical-covered item ${item.id} must have contractReviewed=true`);
      if (normalizeCoverageState(canonical.coverage?.state) !== "covered") {
        failures.push(`canonical-covered item ${item.id} points to uncovered canonical item ${canonical.id}`);
      }
    }
  }
}

function validateWarningCoverage(items, itemById, caseById, failures) {
  for (const item of items) {
    if (item.contracts?.warningsContractual !== true) continue;
    if (normalizeCoverageState(item.coverage?.state) !== "covered") continue;
    const canonical = item.canonicalItemId ? itemById.get(item.canonicalItemId) : null;
    const cases = [...(item.coverage?.cases ?? []), ...(canonical?.coverage?.cases ?? [])];
    const hasWarningAssertion = cases.some((caseId) => caseHasAssertion(caseById.get(caseId), "bestEffortWarning"));
    if (!hasWarningAssertion) failures.push(`covered warning-contract item ${item.id} needs a bestEffortWarning assertion`);
  }
}

function validateSeparateBaseline(compatibility, baseline, itemById, failures) {
  const path = compatibility?.coveragePolicy?.existingClaimBaselinePath;
  if (!path) failures.push("coveragePolicy.existingClaimBaselinePath is required");
  if (compatibility?.coveragePolicy?.existingClaimBaseline) {
    failures.push("coveragePolicy.existingClaimBaseline must live in the separate baseline file");
  }
  if (!baseline) return;
  for (const [status, ids] of Object.entries({ exact: baseline.exact ?? [], best_effort: baseline.best_effort ?? [] })) {
    for (const id of ids) {
      const item = itemById.get(id);
      if (!item) {
        failures.push(`baseline ${status} id is missing from matrix: ${id}`);
        continue;
      }
      if (item.status !== status) failures.push(`baseline id ${id} is listed as ${status}, but matrix status is ${item.status}`);
      if (normalizeCoverageState(item.coverage?.state) === "covered") failures.push(`covered item must be removed from compatibility baseline: ${id}`);
    }
  }
}

function validateUnsupportedRoots(unsupportedRoots, items, failures) {
  if (!unsupportedRoots) return;
  const rootsFromMatrix = unsupportedRuntimeRoots(items);
  const rootsFromArtifact = new Set(unsupportedRoots.unsupportedRoots ?? []);
  const provenanceRoots = new Set((unsupportedRoots.roots ?? []).map((record) => record.root));
  const itemById = new Map(items.map((item) => [item.id, item]));
  for (const root of rootsFromMatrix) {
    if (!rootsFromArtifact.has(root)) failures.push(`unsupported root missing from artifact: ${root}`);
  }
  for (const root of rootsFromArtifact) {
    if (!rootsFromMatrix.has(root)) failures.push(`unsupported root artifact has no matrix metadata: ${root}`);
    if (SUPPORTED_ROOT_DENYLIST.has(root)) failures.push(`supported root must not be marked unsupported: ${root}`);
  }
  if (unsupportedRoots.schemaVersion >= 2) {
    const provenanceRootList = (unsupportedRoots.roots ?? []).map((record) => record.root);
    if (JSON.stringify(unsupportedRoots.unsupportedRoots ?? []) !== JSON.stringify(provenanceRootList)) {
      failures.push("unsupportedRoots must exactly match roots.map(root)");
    }
    for (const root of rootsFromArtifact) {
      if (!provenanceRoots.has(root)) failures.push(`unsupported root artifact is missing provenance for ${root}`);
    }
    for (const record of unsupportedRoots.roots ?? []) {
      if (!rootsFromArtifact.has(record.root)) failures.push(`unsupported root provenance has no matching unsupportedRoots entry: ${record.root}`);
      for (const id of record.itemIds ?? []) {
        const item = itemById.get(id);
        if (!item) {
          failures.push(`unsupported root provenance references unknown item ${id}`);
          continue;
        }
        if (!itemUnsupportedRoots(item).includes(record.root)) {
          failures.push(`unsupported root provenance ${record.root} references ${id}, but matrix metadata does not`);
        }
      }
    }
  }
}

export function unsupportedRuntimeRoots(items) {
  return new Set(unsupportedRootProvenance(items).map((record) => record.root));
}

function normalizeCoverageRecord(record = {}) {
  return {
    ...record,
    state: normalizeCoverageState(record.state ?? "uncovered"),
    tapeCovered: Boolean(record.tapeCovered),
    cases: record.cases ?? [],
  };
}

function fixtureCompatibilityIds(cases) {
  return new Set(
    cases.flatMap((testCase) => (testCase.compatibilityItems ?? []).map((item) => item.id).filter(Boolean))
  );
}

function fixtureTapeCoveredCompatibilityIds(cases) {
  return new Set(
    cases.flatMap((testCase) =>
      (testCase.compatibilityItems ?? [])
        .filter((item) => item.tapeCovered === true)
        .map((item) => item.id)
        .filter(Boolean)
    )
  );
}

function caseHasAssertion(testCase, type) {
  return (testCase?.steps ?? []).some((step) => (step.assertions ?? []).some((assertion) => (assertion.type ?? assertion) === type));
}

function itemDocumentedFlags(item) {
  return [
    ...(item.command?.flags ?? []),
    ...(item.source?.flags ?? []),
    ...(item.documentedItems ?? []).flatMap((source) => source.flags ?? []),
  ].filter(Boolean);
}

function itemSearchText(item) {
  return [
    item.id,
    item.command?.primary,
    item.rationale,
    item.source?.checklist,
    item.source?.heading,
    ...(item.documentedItems ?? []).flatMap((source) => [source.checklist, source.heading]),
  ]
    .filter(Boolean)
    .join("\n");
}

function commandStartsWith(command, token) {
  return String(command ?? "").trim().split(/\s+/)[0] === token;
}

function itemUnsupportedRoots(item) {
  const roots = item.runtime?.unsupportedRoot === true ? [item.command?.primary] : [];
  return [...roots, ...(item.runtime?.unsupportedRoots ?? [])].filter(Boolean).sort();
}

function docsManifestFileRecord(docsRoot, path) {
  const normalized = normalizeDocsManifestContent(readFileSync(join(docsRoot, path), "utf8"));
  return {
    path,
    sha256: createHash("sha256").update(normalized, "utf8").digest("hex"),
    normalizedBytes: Buffer.byteLength(normalized, "utf8"),
  };
}

function isCommandCompatibleWithCanonical(item, canonical) {
  const root = item.command?.primary;
  if (!root) return false;
  const canonicalRoots = new Set([canonical.command?.primary, ...(canonical.aliases ?? []).map((alias) => alias.name)].filter(Boolean));
  return canonicalRoots.has(root);
}

function isUnsafeCanonicalCandidateText(item) {
  const text = [item.source?.checklist, ...(item.documentedItems ?? []).map((source) => source.checklist)]
    .filter(Boolean)
    .join("\n");
  return /&&|(^|\s)\|(\s|$)|support documented usage/i.test(text);
}

function compareCompatibilityItems(left, right) {
  return (
    compareEpicNames(left.ownerEpic, right.ownerEpic) ||
    (STATUS_SORT.get(left.status) ?? 99) - (STATUS_SORT.get(right.status) ?? 99) ||
    String(left.disposition ?? "").localeCompare(String(right.disposition ?? "")) ||
    String(left.id ?? "").localeCompare(String(right.id ?? ""))
  );
}

function compareReviewGroups(left, right) {
  return (
    compareEpicNames(left.ownerEpic, right.ownerEpic) ||
    (STATUS_SORT.get(left.status) ?? 99) - (STATUS_SORT.get(right.status) ?? 99) ||
    String(left.disposition ?? "").localeCompare(String(right.disposition ?? ""))
  );
}

function compareEpicNames(left, right) {
  const leftNumber = epicNumber(left);
  const rightNumber = epicNumber(right);
  if (leftNumber !== rightNumber) return leftNumber - rightNumber;
  return String(left ?? "").localeCompare(String(right ?? ""));
}

function epicNumber(value) {
  const match = String(value ?? "").match(/\bEpic\s+(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function pushUnique(values, value) {
  if (value == null || value === "") return;
  if (!values.includes(value)) values.push(value);
}

function loadDocumentedChecklistItemsFromFile(docsRoot, file) {
  const text = readFileSync(file, "utf8");
  const path = normalizeSlash(relative(docsRoot, file));
  const lines = text.split(/\r?\n/);
  let heading = "";
  let anchor = "";
  const items = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      heading = headingMatch[2].trim();
      anchor = githubHeadingAnchor(heading);
      continue;
    }
    const checklistMatch = line.match(/^\s*- \[([ FPN])\]\s+(.+?)\s*$/);
    if (!checklistMatch) continue;
    items.push({
      kind: "docs",
      path,
      heading,
      anchor,
      checklist: checklistMatch[2].trim(),
      docStatus: checklistMatch[1] === " " ? "blank" : checklistMatch[1],
    });
  }
  return items;
}

function resolveSourceAnchor(docsRoot, source) {
  const file = join(docsRoot, source.path);
  if (!existsSync(file)) return false;
  const anchors = new Set(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^(#{1,6})\s+(.+?)\s*$/)?.[2])
      .filter(Boolean)
      .map(githubHeadingAnchor)
  );
  return anchors.has(source.anchor);
}

function readDirSyncSorted(path) {
  return readdirSync(path).sort();
}

function countBy(values, keyFn) {
  const counts = {};
  for (const value of values) {
    const key = keyFn(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function normalizeSlash(path) {
  return String(path ?? "").replace(/\\/g, "/");
}
