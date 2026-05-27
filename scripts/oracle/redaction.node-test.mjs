import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { redactArtifact, redactDiagnosticText } from "./redaction.mjs";

test("redacts diagnostic text shapes used by auth handoff failures", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
  const input = [
    "open https://example.test/callback?code=oauth-secret&state=public",
    "Authorization: Bearer bearer-secret",
    "Cookie: session=cookie-secret; token=token-secret",
    `password=pw-secret api_key=api-secret ${jwt}`,
  ].join("\n");

  const redacted = redactDiagnosticText(input);

  assert.match(redacted, /\[REDACTED\]/);
  assert.doesNotMatch(redacted, /oauth-secret|bearer-secret|cookie-secret|token-secret|pw-secret|api-secret/);
  assert.doesNotMatch(redacted, new RegExp(jwt.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(redacted, /state=public/);
});

test("redacts persisted oracle result artifacts without mutating the raw record", () => {
  const record = {
    reason: "stdout missing token=artifact-secret",
    steps: [
      {
        commandTemplate: "open https://example.test/?access_token=command-secret",
        agentBrowser: { stdout: "raw page text", stderr: "Cookie: session=cookie-secret" },
        pireBrowser: { stdout: "Authorization: Bearer stdout-secret", stderr: "" },
      },
    ],
  };

  const redacted = redactArtifact(record);

  assert.equal(record.steps[0].agentBrowser.stderr, "Cookie: session=cookie-secret");
  assert.doesNotMatch(JSON.stringify(redacted), /artifact-secret|command-secret|cookie-secret|stdout-secret/);
  assert.match(JSON.stringify(redacted), /\[REDACTED\]/);
});

test("oracle report failed-details redacts diagnostic snippets", async () => {
  const runDir = await mkdtemp(join(tmpdir(), "oracle-report-redaction-"));
  const caseDir = join(runDir, "secret-failure");
  await mkdir(caseDir, { recursive: true });
  await writeFile(
    join(runDir, "summary.json"),
    JSON.stringify(
      {
        pass: false,
        coverageComplete: false,
        startedAt: "2026-05-26T00:00:00.000Z",
        finishedAt: "2026-05-26T00:00:01.000Z",
        cases: [
          {
            id: "secret-failure",
            status: "error",
            pass: false,
            reason: "failed token=summary-secret",
            compatibilityItems: [],
          },
        ],
      },
      null,
      2
    )
  );
  await writeFile(
    join(caseDir, "result.json"),
    JSON.stringify(
      {
        steps: [
          {
            id: "one",
            pass: false,
            commandTemplate: "open https://example.test/?code=command-secret",
            agentBrowser: { exitCode: 1, finishReason: "close", stdout: "Authorization: Bearer agent-secret" },
            pireBrowser: { exitCode: 1, finishReason: "close", stdout: "token=pire-secret" },
          },
        ],
      },
      null,
      2
    )
  );

  const result = spawnSync(process.execPath, [resolve("scripts/oracle/report.mjs"), "--run", runDir, "--failed-details"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /\[REDACTED\]/);
  assert.doesNotMatch(result.stdout, /summary-secret|command-secret|agent-secret|pire-secret/);
});
