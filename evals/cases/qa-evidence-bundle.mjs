export default {
  id: "canonical-qa-evidence-bundle",
  category: "qa",
  title: "Produce a stable, secret-safe QA evidence bundle",
  prompt: "Propose the canonical QA evidence loop for a reproducible authenticated-app finding. Derive one stable worktree session, launch or restore it, start trace, recording, and network HAR before navigation or the repro, use fresh snapshots while reproducing, then capture the final screenshot, URL, and snapshot. Stop collectors in reverse order: HAR, recording, trace, including a failure-safe cleanup note. Report artifact paths and never paste secrets.",
  expected: [
    { id: "stable-session", pattern: /pire-browser\s+session\s+id\s+--scope\s+worktree\s+--prefix\s+\S+/i, description: "Uses one stable worktree session" },
    { id: "trace", pattern: /pire-browser\s+(?:--session\s+\S+(?:\s+--restore)?\s+)?trace\s+(?:start|stop)\b/i, description: "Captures a Firefox trace bundle" },
    { id: "har", pattern: /pire-browser\s+(?:--session\s+\S+(?:\s+--restore)?\s+)?network\s+har\s+(?:start|stop)\b/i, description: "Captures and exports HAR evidence" },
    { id: "recording", pattern: /pire-browser\s+(?:--session\s+\S+(?:\s+--restore)?\s+)?record\s+(?:start|stop)\b/i, description: "Captures screenshot-sequence recording evidence" },
    { id: "final-screenshot", pattern: /pire-browser\s+(?:--session\s+\S+(?:\s+--restore)?\s+)?screenshot\b/i, description: "Captures a final screenshot" },
    { id: "final-snapshot", pattern: /pire-browser\s+(?:--session\s+\S+(?:\s+--restore)?\s+)?snapshot(?:\s+-i)?(?:\s+(?:--compact|-c))?/i, description: "Captures a final snapshot" },
  ],
  ordered: [
    { id: "collect-before-repro", patterns: [/trace\s+start/i, /(?:network\s+har\s+start|record\s+start)/i, /pire-browser[^\r\n]*\b(?:navigate|open)\b/i], description: "Starts evidence collectors before navigation or repro" },
    { id: "reverse-order-stop", patterns: [/network\s+har\s+stop/i, /record\s+stop/i, /trace\s+stop/i], description: "Stops HAR, recording, and trace in reverse order" },
  ],
  forbidden: [
    { id: "wrong-trace-claim", pattern: /\b(?:is|as|called|described\s+as|report(?:ed)?\s+as)\s+(?:a\s+)?(?:Chrome\s+DevTools\s+(?:performance\s+)?trace|CPU\s+profile|native\s+WebM)\b/i, description: "Uses the Firefox evidence terminology" },
    { id: "secret-evidence", pattern: /(?:Cookie|Authorization|Bearer|password|access_token|refresh_token)\s*[:=]\s*[^\s'"]+/i, description: "Does not paste secret evidence" },
    { id: "forward-stop-order", pattern: /trace\s+stop[\s\S]*record\s+stop[\s\S]*network\s+har\s+stop/i, description: "Does not stop collectors in start order" },
  ],
};
