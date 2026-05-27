const REDACTED = "[REDACTED]";

const SENSITIVE_QUERY_KEYS =
  /([?&](?:access_token|refresh_token|id_token|token|code|client_secret|secret|password|api[_-]?key|auth|session|otp|one_time_code)=)([^&#\s"')\]}<>]+)/gi;
const BEARER_TOKEN = /\b(Bearer\s+)([A-Za-z0-9._~+/=-]{6,})/gi;
const JWT_LIKE = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const COOKIE_HEADER = /^(\s*(?:set-cookie|cookie)\s*:\s*).+$/gim;
const KEY_VALUE =
  /\b((?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|password|secret|token|authorization|cookie|otp|one[_-]?time[_-]?code)\s*[:=]\s*)(["']?)([^"'\s,;&)}\]]+)(["']?)/gi;

export function redactDiagnosticText(value) {
  return String(value ?? "")
    .replace(COOKIE_HEADER, `$1${REDACTED}`)
    .replace(BEARER_TOKEN, `$1${REDACTED}`)
    .replace(SENSITIVE_QUERY_KEYS, `$1${REDACTED}`)
    .replace(KEY_VALUE, `$1$2${REDACTED}$4`)
    .replace(JWT_LIKE, REDACTED);
}

export function redactArtifact(value) {
  if (typeof value === "string") return redactDiagnosticText(value);
  if (Array.isArray(value)) return value.map((item) => redactArtifact(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactArtifact(entry)]));
  }
  return value;
}
