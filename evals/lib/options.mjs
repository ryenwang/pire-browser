const PROVIDERS = new Set(["claude", "codex"]);
const JUDGES = new Set(["none", "claude", "codex"]);

export const DEFAULT_OPTIONS = Object.freeze({
  provider: "codex",
  model: undefined,
  categories: [],
  caseIds: [],
  timeoutMs: 120_000,
  json: false,
  output: undefined,
  judge: "none",
  judgeModel: undefined,
  judgeTimeoutMs: 60_000,
});

function valueFor(args, index, flag) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function integerValue(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

function addListValue(target, value) {
  for (const part of value.split(",")) {
    const trimmed = part.trim();
    if (trimmed && !target.includes(trimmed)) target.push(trimmed);
  }
}

export function parseArgs(args = process.argv.slice(2)) {
  const expandedArgs = [];
  for (const arg of args) {
    const equals = arg.startsWith("--") ? arg.indexOf("=") : -1;
    if (equals > 2) expandedArgs.push(arg.slice(0, equals), arg.slice(equals + 1));
    else expandedArgs.push(arg);
  }
  const options = { ...DEFAULT_OPTIONS, categories: [], caseIds: [] };
  for (let index = 0; index < expandedArgs.length; index += 1) {
    const arg = expandedArgs[index];
    if (arg === "--help" || arg === "-h") return { help: true, options };
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--provider") {
      options.provider = valueFor(expandedArgs, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--model") {
      options.model = valueFor(expandedArgs, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--category") {
      addListValue(options.categories, valueFor(expandedArgs, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--case") {
      addListValue(options.caseIds, valueFor(expandedArgs, index, arg));
      index += 1;
      continue;
    }
    if (arg === "--timeout") {
      options.timeoutMs = integerValue(valueFor(expandedArgs, index, arg), arg);
      index += 1;
      continue;
    }
    if (arg === "--output") {
      options.output = valueFor(expandedArgs, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--judge") {
      options.judge = valueFor(expandedArgs, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--judge-model") {
      options.judgeModel = valueFor(expandedArgs, index, arg);
      index += 1;
      continue;
    }
    if (arg === "--judge-timeout") {
      options.judgeTimeoutMs = integerValue(valueFor(expandedArgs, index, arg), arg);
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${arg}`);
  }

  if (!PROVIDERS.has(options.provider)) {
    throw new Error(`--provider must be one of ${[...PROVIDERS].join(", ")}`);
  }
  if (!JUDGES.has(options.judge)) {
    throw new Error(`--judge must be one of ${[...JUDGES].join(", ")}`);
  }
  return { help: false, options };
}

export function usage() {
  return `Usage: node evals/run.mjs [options]

Run optional live agent workflow evaluations. The agent proposes commands; this harness never runs browser commands.

Options:
  --provider <claude|codex>  Installed agent CLI to invoke (default: codex)
  --model <name>             Provider model override
  --category <name[,name]>   Filter by case category (repeatable)
  --case <id[,id]>           Filter by case id (repeatable)
  --timeout <ms>             Per-agent timeout (default: 120000)
  --json                     Print the structured report as JSON
  --output <path>            Also write the structured report to a file
  --judge <none|claude|codex> Optional second-pass model judge (default: none)
  --judge-model <name>       Model for the optional judge
  --judge-timeout <ms>       Optional judge timeout (default: 60000)
  --help                     Show this help

AI_GATEWAY_API_KEY is required for live provider calls.`;
}
