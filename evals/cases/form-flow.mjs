export default {
  id: "inspect-act-verify-form",
  category: "workflow",
  title: "Inspect, fill, submit, and verify with fresh snapshots",
  prompt: "Propose an inspect-act-verify flow for a form at https://example.com/contact. Use a snapshot to discover refs, fill an email and message field, click submit, and verify the result with a fresh snapshot and a targeted URL or text check. Make it clear that refs from the old snapshot are not reused after the DOM changes.",
  expected: [
    { id: "initial-snapshot", pattern: /pire-browser\s+snapshot\b/i, description: "Inspects the form before choosing targets" },
    { id: "fill-form", pattern: /pire-browser\s+fill\b/i, description: "Fills form fields using discovered targets" },
    { id: "submit-form", pattern: /pire-browser\s+click\b/i, description: "Submits the form" },
    { id: "targeted-verification", pattern: /pire-browser\s+(?:get\s+(?:text|url)|snapshot)\b/i, description: "Verifies the result" },
  ],
  ordered: [
    { id: "fresh-snapshot-around-actions", patterns: [/pire-browser\s+snapshot\b/i, /pire-browser\s+fill\b/i, /pire-browser\s+click\b/i, /pire-browser\s+snapshot\b/i], description: "Uses inspect, action, and a fresh post-action snapshot" },
  ],
  forbidden: [
    { id: "stale-ref-reuse", pattern: /\b(?:reuse|use)\s+(?:the\s+)?(?:same|old|stale)\s+(?:ref|snapshot)/i, description: "Does not reuse stale refs" },
    { id: "unverified-success", pattern: /\b(?:assume|assumes|assuming)\s+(?:the\s+)?(?:form|submit|submission)\s+(?:worked|succeeded|is successful)/i, description: "Does not infer success without output evidence" },
    { id: "secret-form-data", pattern: /(?:password|cookie|authorization:\s*bearer|api[_-]?key)\s*[:=]\s*[^\s'"]+/i, description: "Does not include secret form data" },
  ],
};
