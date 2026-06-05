import { featureStatuses, statusLabels } from "./feature-status.mjs";

export const h2 = (text, id) => ({ kind: "heading", level: 2, text, id });
export const h3 = (text, id) => ({ kind: "heading", level: 3, text, id });
export const p = (html) => ({ kind: "paragraph", html });
export const list = (items) => ({ kind: "list", items });
export const ol = (items) => ({ kind: "ordered-list", items });
export const code = (value, lang = "bash", options = {}) => ({ kind: "code", value, lang, ...options });
export const note = (html, tone = "info") => ({ kind: "note", html, tone });
export const table = (headers, rows) => ({ kind: "table", headers, rows });

export const page = ({ path, title, navTitle = title, description, badge, blocks }) => ({
  path,
  title,
  navTitle,
  description,
  badge,
  blocks,
});

export const unavailable = (feature) =>
  note(
    `<strong>Not in the Firefox backend today:</strong> ${feature}. Use the local workflow below when you need a supported pire-browser path.`,
    "warn",
  );

export const statusNote = (featureId, summary) => {
  const feature = featureStatuses[featureId];
  if (!feature) {
    throw new Error(`Unknown site feature status: ${featureId}`);
  }
  const tone = feature.status === "not_available" || feature.status === "partial" ? "warn" : "info";
  return note(`<strong>Current: ${statusLabels[feature.status]}.</strong> ${summary || feature.summary}`, tone);
};

export const providerBlocks = (name, envVar) => [
  statusNote("providerIntegrations", `${name} cloud sessions are not part of the local Firefox runtime.`),
  h2("Local Firefox runtime", "local-firefox-runtime"),
  p(`${name} provider credentials and remote browser sessions are not used by pire-browser today. Commands run against local Firefox through Native Messaging.`),
  h2("Local workflow", "local-workflow"),
  code(`${envVar ? `# ${envVar} is not used by pire-browser today\n` : ""}pire-browser open https://example.com
pire-browser snapshot -i`),
];
