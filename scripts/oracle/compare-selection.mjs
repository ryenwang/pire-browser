export function parseCaseFilter(value = "") {
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function selectOracleCases(
  allCases,
  { caseFilterText = "", visibleOnly = false, visibleRun = false, includeSmoke = false } = {}
) {
  const requestedCaseIds = parseCaseFilter(caseFilterText);
  const availableCaseIds = allCases.map((testCase) => testCase.id);
  const available = new Set(availableCaseIds);
  const unknown = requestedCaseIds.filter((id) => !available.has(id));
  if (unknown.length) {
    throw new Error(
      `Unknown oracle case id(s): ${unknown.join(", ")}. Available case ids: ${availableCaseIds.join(", ")}`
    );
  }

  let selected = requestedCaseIds.length
    ? allCases.filter((testCase) => requestedCaseIds.includes(testCase.id))
    : [...allCases];

  if (visibleOnly) {
    const unsafe = selected.filter((testCase) => !testCase.visibleSafe).map((testCase) => testCase.id);
    if (unsafe.length) {
      throw new Error(`ORACLE_VISIBLE_ONLY selected non-visibleSafe case id(s): ${unsafe.join(", ")}`);
    }
    selected = selected.filter((testCase) => testCase.visibleSafe);
  }

  if (!requestedCaseIds.length && !includeSmoke) {
    selected = selected.filter((testCase) => testCase.status !== "smoke");
  }

  if (!selected.length) {
    throw new Error("Oracle case selection is empty. Check ORACLE_CASE_FILTER, ORACLE_VISIBLE_ONLY, and ORACLE_INCLUDE_SMOKE.");
  }

  const coverageCaseIds = allCases.filter((testCase) => testCase.status !== "smoke").map((testCase) => testCase.id);
  const selectedCaseIds = selected.map((testCase) => testCase.id);
  const coverageComplete =
    !visibleRun &&
    !visibleOnly &&
    !includeSmoke &&
    !requestedCaseIds.length &&
    sameStringSet(selectedCaseIds, coverageCaseIds);

  const selection = {
    requestedCaseIds,
    visibleOnly,
    includeSmoke,
    selectedCaseIds,
    availableCaseIds,
    coverageCaseIds,
    coverageComplete,
  };

  return {
    cases: selected,
    runKind: visibleRun ? "visible-compare" : "deterministic-compare",
    coverageComplete,
    selection,
  };
}

function sameStringSet(left, right) {
  if (left.length !== right.length) return false;
  const rightSet = new Set(right);
  return left.every((item) => rightSet.has(item));
}
