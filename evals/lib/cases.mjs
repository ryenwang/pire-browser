import skillLoading from "../cases/skill-loading.mjs";
import formFlow from "../cases/form-flow.mjs";
import tabsWindows from "../cases/tabs-windows.mjs";
import profileImport from "../cases/profile-import.mjs";
import qaEvidence from "../cases/qa-evidence-bundle.mjs";
import contextFootprint from "../cases/context-footprint.mjs";

export const CASES = Object.freeze([
  skillLoading,
  formFlow,
  tabsWindows,
  profileImport,
  qaEvidence,
  contextFootprint,
]);

export function getCases() {
  return [...CASES];
}
