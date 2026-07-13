function asRegExp(pattern) {
  if (pattern instanceof RegExp) return new RegExp(pattern.source, pattern.flags.replaceAll("g", ""));
  if (typeof pattern === "string") return new RegExp(pattern, "im");
  if (pattern && typeof pattern.source === "string") {
    return new RegExp(pattern.source, pattern.flags ?? "im");
  }
  throw new TypeError("evaluation patterns must be RegExp values, strings, or {source, flags} objects");
}

function patternId(pattern, fallback) {
  return pattern?.id ?? fallback;
}

function describePattern(pattern, fallback) {
  const regex = asRegExp(pattern.pattern ?? pattern);
  return {
    id: patternId(pattern, fallback),
    pattern: regex.source,
    flags: regex.flags,
    description: pattern?.description,
  };
}

function matches(text, pattern) {
  return asRegExp(pattern.pattern ?? pattern).test(text);
}

function scoreSequence(text, sequence, index) {
  let cursor = 0;
  for (const [partIndex, pattern] of sequence.patterns.entries()) {
    const regex = asRegExp(pattern.pattern ?? pattern);
    const match = regex.exec(text.slice(cursor));
    if (!match) {
      return {
        id: sequence.id ?? `sequence-${index + 1}`,
        matched: false,
        description: sequence.description,
        patterns: sequence.patterns.map((item, itemIndex) => describePattern(item, `${index + 1}.${itemIndex + 1}`)),
      };
    }
    cursor += match.index + match[0].length;
  }
  return {
    id: sequence.id ?? `sequence-${index + 1}`,
    matched: true,
    description: sequence.description,
    patterns: sequence.patterns.map((item, itemIndex) => describePattern(item, `${index + 1}.${itemIndex + 1}`)),
  };
}

export function scoreResponse(response, rubric) {
  const text = String(response ?? "");
  const expected = (rubric.expected ?? []).map((pattern, index) => ({
    ...describePattern(pattern, `expected-${index + 1}`),
    matched: matches(text, pattern),
  }));
  const forbidden = (rubric.forbidden ?? []).map((pattern, index) => ({
    ...describePattern(pattern, `forbidden-${index + 1}`),
    matched: matches(text, pattern),
  }));
  const ordered = (rubric.ordered ?? []).map((sequence, index) => scoreSequence(text, sequence, index));
  const checks = [...expected, ...ordered];
  const matched = checks.filter((check) => check.matched).length;
  const violations = forbidden.filter((check) => check.matched).length;
  const total = checks.length;
  const rawScore = total === 0 ? (violations === 0 ? 1 : 0) : (matched - violations) / total;
  const score = Math.max(0, Math.min(1, Number(rawScore.toFixed(3))));
  return {
    passed: checks.every((check) => check.matched) && violations === 0,
    score,
    expected: {
      total: expected.length,
      matched: expected.filter((check) => check.matched).length,
      missing: expected.filter((check) => !check.matched).map((check) => check.id),
      checks: expected,
    },
    ordered: {
      total: ordered.length,
      matched: ordered.filter((check) => check.matched).length,
      missing: ordered.filter((check) => !check.matched).map((check) => check.id),
      checks: ordered,
    },
    forbidden: {
      total: forbidden.length,
      matched: forbidden.filter((check) => check.matched).map((check) => check.id),
      checks: forbidden,
    },
  };
}

export function filterCases(cases, { categories = [], caseIds = [] } = {}) {
  return cases.filter((item) => {
    const categoryMatches = categories.length === 0 || categories.includes(item.category);
    const idMatches = caseIds.length === 0 || caseIds.includes(item.id);
    return categoryMatches && idMatches;
  });
}
