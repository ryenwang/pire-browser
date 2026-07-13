import { spawn } from "node:child_process";
import { tmpdir } from "node:os";

export class EvalError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = "EvalError";
    this.code = code;
    Object.assign(this, details);
  }
}

const PROVIDER_CONFIG = {
  claude: {
    command: "claude",
    args: ({ model }) => [
      "--print",
      "--output-format",
      "json",
      "--permission-mode",
      "plan",
      "--strict-mcp-config",
      ...(model ? ["--model", model] : []),
    ],
  },
  codex: {
    command: "codex",
    args: ({ model }) => [
      "exec",
      "--json",
      "--sandbox",
      "read-only",
      "--ephemeral",
      "--skip-git-repo-check",
      ...(model ? ["--model", model] : []),
      "-",
    ],
  },
};

export function redactSecrets(value, extraSecrets = []) {
  let text = String(value ?? "");
  for (const secret of extraSecrets) {
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  text = text
    .replace(/(AI_GATEWAY_API_KEY\s*[=:]\s*)[^\s\"']+/gi, "$1[REDACTED]")
    .replace(/(authorization\s*:\s*bearer\s+)[^\s\"']+/gi, "$1[REDACTED]")
    .replace(/\bBearer\s+[^\s\"']+/gi, "Bearer [REDACTED]")
    .replace(/(cookie\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/\b(?:token|access_token|refresh_token|id_token|client_secret|password|api[-_]?key)\s*[=:]\s*[^\s\"']+/gi, (match) => match.replace(/([=:]\s*)[^\s\"']+$/, "$1[REDACTED]"))
    .replace(/([?&](?:access_token|refresh_token|id_token|token|code|client_secret|password|api_key)=)[^&\s]+/gi, "$1[REDACTED]");
  return text;
}

function collectAgentText(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectAgentText(item, output);
    return output;
  }
  if (!value || typeof value !== "object") return output;
  if (value.type === "agent_message" && value.text) output.push(String(value.text));
  for (const key of ["result", "output", "text", "content", "message", "item"]) {
    if (key in value) collectAgentText(value[key], output);
  }
  return output;
}

export function extractProviderText(stdout) {
  const raw = String(stdout ?? "").trim();
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    const values = collectAgentText(parsed).filter(Boolean);
    return values.at(-1) ?? raw;
  } catch {
    const values = [];
    for (const line of raw.split(/\r?\n/)) {
      try {
        const parsed = JSON.parse(line);
        collectAgentText(parsed, values);
      } catch {
        // Plain text provider output is valid and is handled below.
      }
    }
    return values.filter(Boolean).at(-1) ?? raw;
  }
}

function providerInvocation(config, args, platform, env) {
  if (platform !== "win32") return { command: config.command, args };
  return {
    command: env.ComSpec || env.COMSPEC || "cmd.exe",
    args: ["/d", "/s", "/c", `${config.command}.cmd`, ...args],
  };
}

export function runProvider({ provider, model, prompt, timeoutMs = 120_000, env = process.env, spawnImpl = spawn, cwd = tmpdir(), platform = process.platform }) {
  const config = PROVIDER_CONFIG[provider];
  if (!config) return Promise.reject(new EvalError("UNSUPPORTED_PROVIDER", `Unsupported provider: ${provider}`));
  if (model && !/^[A-Za-z0-9._:/-]+$/.test(model)) {
    return Promise.reject(new EvalError("INVALID_MODEL", "Model names may contain only letters, numbers, dot, underscore, colon, slash, or hyphen."));
  }
  const args = config.args({ model });
  const invocation = providerInvocation(config, args, platform, env);
  const childEnv = { ...env };
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const child = spawnImpl(invocation.command, invocation.args, { cwd, env: childEnv, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback(value);
    };
    const timer = setTimeout(() => {
      child.kill?.("SIGTERM");
      finish(reject, new EvalError("PROVIDER_TIMEOUT", `${provider} did not finish within ${timeoutMs}ms`, { provider, timeoutMs }));
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.stdin?.on?.("error", () => {});
    child.stdin?.end(String(prompt ?? ""));
    child.once("error", (error) => {
      const code = error.code === "ENOENT" ? "PROVIDER_CLI_NOT_FOUND" : "PROVIDER_SPAWN_ERROR";
      finish(reject, new EvalError(code, `${provider} CLI could not be started: ${error.message}`, { provider }));
    });
    child.once("close", (exitCode, signal) => {
      const safeStderr = redactSecrets(stderr, [env.AI_GATEWAY_API_KEY]);
      if (exitCode !== 0) {
        finish(reject, new EvalError("PROVIDER_CLI_FAILED", `${provider} CLI exited with code ${exitCode ?? "unknown"}${signal ? ` (${signal})` : ""}${safeStderr ? `: ${safeStderr.trim()}` : ""}`, { provider, exitCode }));
        return;
      }
      const text = extractProviderText(stdout);
      if (!text) {
        finish(reject, new EvalError("PROVIDER_EMPTY_OUTPUT", `${provider} CLI returned no agent response`, { provider }));
        return;
      }
      finish(resolve, { provider, model, text: redactSecrets(text, [env.AI_GATEWAY_API_KEY]) });
    });
  });
}
