import { readFile, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DEFAULT_MAX_ATTEMPTS, agentTargets, withAgentSetting } from "./agents.js";
import { pathExists } from "./fs-utils.js";
import { defaultConfig } from "./templates.js";
import type {
  AgentEntryConfig,
  AgentModelConfig,
  AgentName,
  AgentTarget,
  AgentsConfig,
  AppliedTemplatePack,
  Target,
  Workflow,
  WorkflowDefault,
  akrctxConfig,
} from "./types.js";
import { agentNames, targets, workflows } from "./types.js";

const configPath = ".akrctx/config.json";

const agentConfigKeys = agentNames.flatMap((name) => [
  `agents.${name}.enabled`,
  `agents.${name}.trigger`,
  `agents.${name}.targets`,
  ...agentTargets.map((target) => `agents.${name}.model.${target}`),
]);

const validConfigKeys = [
  "defaultWorkflow",
  "defaults.workflow",
  "defaultTarget",
  "defaults.target",
  "allowedWorkflows",
  "defaults.allowedWorkflows",
  "requireTaskCapsule",
  "defaults.requireTaskCapsule",
  "requireWorkflowReason",
  "defaults.requireWorkflowReason",
  "contextBudget",
  "defaults.contextBudget",
  ...agentConfigKeys,
  "agents.implementer.maxAttempts",
] as const;

/**
 * Read the project config, distinguishing a missing config (returns undefined) from an
 * unusable one (throws).
 *
 * Both cases used to return undefined, and callers could not tell them apart. That is
 * not a cosmetic difference: `runTask` reads the config to learn which workflows the
 * project allows, and an undefined config there means "no restrictions", so a single
 * stray character in config.json silently granted every workflow and dropped
 * `defaults.workflow`. Failing loudly is the only behavior that keeps the declared
 * contract and the enforced one in agreement.
 *
 * `readConfigForDiagnosis` is the sole exception, and it exists for exactly one caller.
 */
export async function readConfig(cwd: string): Promise<akrctxConfig | undefined> {
  const absolute = path.join(cwd, configPath);
  if (!(await pathExists(absolute))) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(absolute, "utf8"));
  } catch {
    throw new Error(".akrctx/config.json is invalid JSON — fix it manually or restore from git before running init.");
  }
  return normalizeConfig(raw);
}

/**
 * Read the config, treating an unusable one as absent.
 *
 * Only `doctor` may use this. Diagnosing a broken repository is its entire purpose, so
 * it has to keep running over a config it cannot parse and report the damage through
 * `getConfigGaps` instead of aborting on it. Every other caller acts on the config and
 * must use `readConfig`, which refuses to guess.
 */
export async function readConfigForDiagnosis(cwd: string): Promise<akrctxConfig | undefined> {
  try {
    return await readConfig(cwd);
  } catch {
    return undefined;
  }
}

export async function writeConfig(cwd: string, config: akrctxConfig, dryRun = false): Promise<void> {
  if (dryRun) return;
  const absolute = path.join(cwd, configPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function normalizeConfig(raw: unknown): akrctxConfig {
  // A config that is valid JSON but not an object carries no target list, and the old
  // fallback answered that by inventing a codex install. Silently retargeting somebody
  // else's repository is worse than refusing to read it.
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(".akrctx/config.json is not a JSON object — fix it manually or restore from git.");
  }
  const partial = raw as Partial<akrctxConfig>;
  const configuredTargets = Array.isArray(partial.targets)
    ? partial.targets.filter((target): target is Target => targets.includes(target as Target))
    : [];
  if (configuredTargets.length === 0) {
    throw new Error(
      `.akrctx/config.json lists no recognized target. Valid targets: ${targets.join(", ")}. Run \`akrctx doctor\` to see the gap.`,
    );
  }
  const base = defaultConfig(configuredTargets);

  return {
    ...base,
    ...partial,
    targets: configuredTargets,
    templatePacks: normalizeTemplatePacks(partial.templatePacks),
    sourceOfTruth: ".akrctx",
    createdBy: "akrctx",
    defaults: {
      ...base.defaults,
      ...(partial.defaults ?? {}),
      workflow: normalizeWorkflowDefault(partial.defaults?.workflow) ?? base.defaults.workflow,
      allowedWorkflows: normalizeAllowedWorkflows(partial.defaults?.allowedWorkflows) ?? base.defaults.allowedWorkflows,
    },
    workflowRules: {
      ...base.workflowRules,
      ...(partial.workflowRules ?? {}),
    },
    comprehensionGate: normalizeComprehensionGate(partial.comprehensionGate, base.comprehensionGate),
    agents: normalizeAgents(partial.agents),
    impl: normalizeImpl(partial.impl),
  };
}

/**
 * Normalize the canonical `agents` block.
 *
 * Malformed fields fall back to the built-in default the way `comprehensionGate` already
 * does. The one exception that throws is `maxAttempts` outside the domain akrctx fully
 * knows: an unparseable budget that fell back to a default would silently grant a fresh
 * attempt allowance, which is the failure the budget exists to prevent.
 *
 * An entry akrctx has no command behind is carried through untouched and warned about.
 * Rejecting it would make a configuration written by a newer akrctx disable every command
 * of an older one, and dropping it would make the older one's next write delete the newer
 * one's settings — a loud failure traded for a silent loss.
 */
function normalizeAgents(value: unknown): AgentsConfig | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`.akrctx/config.json — "agents" must be an object with entries: ${agentNames.join(", ")}.`);
  }
  const result: AgentsConfig = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!(agentNames as readonly string[]).includes(key)) {
      result[key] = raw;
      continue;
    }
    const name = key as AgentName;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`.akrctx/config.json — agents.${name} must be an object.`);
    }
    const entry = raw as Record<string, unknown>;
    const normalized: AgentEntryConfig = {};

    if (typeof entry.enabled === "boolean") normalized.enabled = entry.enabled;
    if (typeof entry.trigger === "string" && entry.trigger.trim()) normalized.trigger = entry.trigger.trim();
    if (Array.isArray(entry.targets)) {
      normalized.targets = entry.targets.filter((target): target is Target => targets.includes(target as Target));
    }
    const model = normalizeAgentModel(entry.model);
    if (model) normalized.model = model;

    if (entry.maxAttempts !== undefined) {
      if (name !== "implementer") {
        throw new Error(".akrctx/config.json — maxAttempts is only valid on agents.implementer.");
      }
      normalized.maxAttempts = requireMaxAttempts(entry.maxAttempts);
    }

    result[name] = normalized;
  }
  return result;
}

function normalizeAgentModel(value: unknown): AgentModelConfig | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const model: AgentModelConfig = {};
  for (const [target, id] of Object.entries(value as Record<string, unknown>)) {
    if (!(agentTargets as string[]).includes(target)) continue;
    if (typeof id === "string" && id.trim()) model[target as AgentTarget] = id.trim();
  }
  return Object.keys(model).length ? model : undefined;
}

function requireMaxAttempts(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      `.akrctx/config.json — agents.implementer.maxAttempts must be a positive integer (default ${DEFAULT_MAX_ATTEMPTS}), got: ${JSON.stringify(value)}.`,
    );
  }
  return parsed;
}

function normalizeImpl(value: unknown): akrctxConfig["impl"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const enabled = (value as { enabled?: unknown }).enabled;
  return typeof enabled === "boolean" ? { enabled } : undefined;
}

function normalizeTemplatePacks(value: unknown): AppliedTemplatePack[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): AppliedTemplatePack[] => {
    if (!entry || typeof entry !== "object") return [];
    const candidate = entry as Partial<AppliedTemplatePack>;
    if (
      typeof candidate.name !== "string" ||
      !candidate.name.trim() ||
      typeof candidate.version !== "string" ||
      !candidate.version.trim() ||
      !["bundled", "local"].includes(String(candidate.source)) ||
      !Array.isArray(candidate.targets) ||
      !candidate.fileHashes ||
      typeof candidate.fileHashes !== "object" ||
      Array.isArray(candidate.fileHashes)
    ) {
      return [];
    }
    const configuredTargets = candidate.targets.filter((target): target is Target =>
      targets.includes(target as Target),
    );
    if (configuredTargets.length === 0) return [];
    return [
      {
        name: candidate.name.trim(),
        version: candidate.version.trim(),
        source: candidate.source as AppliedTemplatePack["source"],
        targets: Array.from(new Set(configuredTargets)),
        fileHashes: Object.fromEntries(
          Object.entries(candidate.fileHashes).filter(
            ([relativePath, hash]) =>
              relativePath.length > 0 &&
              !path.posix.isAbsolute(relativePath) &&
              !relativePath.split("/").includes("..") &&
              /^sha256:[0-9a-f]{64}$/.test(String(hash)),
          ),
        ) as Record<string, string>,
      },
    ];
  });
}

function normalizeComprehensionGate(
  value: unknown,
  fallback: akrctxConfig["comprehensionGate"],
): akrctxConfig["comprehensionGate"] {
  if (!value || typeof value !== "object") return fallback;
  const gate = value as Partial<akrctxConfig["comprehensionGate"]>;
  return {
    enabled: typeof gate.enabled === "boolean" ? gate.enabled : fallback.enabled,
    // A trigger is a free string under the `agents` contract: an unrecognized value is
    // propagated with a warning, never clamped to the default behind the user's back.
    trigger: typeof gate.trigger === "string" && gate.trigger.trim() ? gate.trigger.trim() : fallback.trigger,
    evaluationMode: gate.evaluationMode === "prefer-independent" ? gate.evaluationMode : fallback.evaluationMode,
  };
}

export async function setConfigValue(cwd: string, key: string, value: string, dryRun = false): Promise<akrctxConfig> {
  const normalizedKey = key.trim();

  if (!(validConfigKeys as readonly string[]).includes(normalizedKey)) {
    throw new Error(`Unsupported config key: "${normalizedKey}". Valid keys: ${validConfigKeys.join(", ")}.`);
  }

  const current = (await readConfig(cwd)) ?? defaultConfig(["codex"]);
  const next = structuredClone(current);

  if (normalizedKey === "defaultWorkflow" || normalizedKey === "defaults.workflow") {
    next.defaults.workflow = requireWorkflowDefault(value);
  } else if (normalizedKey === "defaultTarget" || normalizedKey === "defaults.target") {
    next.defaults.target = requireTarget(value);
  } else if (normalizedKey === "allowedWorkflows" || normalizedKey === "defaults.allowedWorkflows") {
    next.defaults.allowedWorkflows = parseAllowedWorkflows(value);
  } else if (normalizedKey === "requireTaskCapsule" || normalizedKey === "defaults.requireTaskCapsule") {
    next.defaults.requireTaskCapsule = parseBoolean(value);
  } else if (normalizedKey === "requireWorkflowReason" || normalizedKey === "defaults.requireWorkflowReason") {
    next.defaults.requireWorkflowReason = parseBoolean(value);
  } else if (normalizedKey === "contextBudget" || normalizedKey === "defaults.contextBudget") {
    next.defaults.contextBudget = requireContextBudget(value);
  } else if (normalizedKey.startsWith("agents.")) {
    return writeAgentKey(cwd, next, normalizedKey, value, dryRun);
  }

  await writeConfig(cwd, next, dryRun);
  return next;
}

async function writeAgentKey(
  cwd: string,
  config: akrctxConfig,
  key: string,
  value: string,
  dryRun: boolean,
): Promise<akrctxConfig> {
  const [, name, field, target] = key.split(".") as [string, AgentName, string, AgentTarget | undefined];
  const patch: AgentEntryConfig = {};

  if (field === "enabled") patch.enabled = parseBoolean(value);
  else if (field === "trigger") patch.trigger = value.trim();
  else if (field === "targets") patch.targets = parseTargets(value);
  else if (field === "maxAttempts") patch.maxAttempts = requireMaxAttempts(value);
  else if (field === "model" && target) {
    patch.model = { ...(config.agents?.[name]?.model ?? {}), [target]: value.trim() };
  }

  const next = withAgentSetting(config, name, patch);
  await writeConfig(cwd, next, dryRun);
  return next;
}

function parseTargets(value: string): Target[] {
  const items = value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (items.length === 0) {
    throw new Error(`agents.<name>.targets must list at least one target. Valid targets: ${targets.join(", ")}.`);
  }
  return items.map(requireTarget);
}

function normalizeWorkflowDefault(value: unknown): WorkflowDefault | undefined {
  if (typeof value !== "string") return undefined;
  if (value === "task-fit") return "task-fit";
  return normalizeWorkflow(value);
}

function requireWorkflowDefault(value: string): WorkflowDefault {
  if (value === "task-fit") return "task-fit";
  const workflow = normalizeWorkflow(value);
  if (!workflow) throw new Error(`Unsupported workflow: "${value}". Valid values: task-fit, ${workflows.join(", ")}.`);
  return workflow;
}

export function normalizeWorkflow(value: string | undefined): Workflow | undefined {
  if (!value) return undefined;
  // Normalize separators: spaces and hyphens become underscores, then map to canonical names.
  const normalized = value.trim().toUpperCase().replace(/\s+/g, "").replace(/-/g, "_");

  const aliases: Record<string, Workflow> = {
    FASTPATCH: "fast-patch",
    FAST_PATCH: "fast-patch",
    RESEARCHFIRST: "research-first",
    RESEARCH_FIRST: "research-first",
    SDD: "SDD",
    TDD: "TDD",
    EDD: "EDD",
    // Plus-separated combos (preserved through normalization)
    "SDD+TDD": "SDD+TDD",
    "TDD+SDD": "SDD+TDD",
    "SDD+EDD": "SDD+EDD",
    "EDD+SDD": "SDD+EDD",
    "TDD+EDD": "TDD+EDD",
    "EDD+TDD": "TDD+EDD",
    // Underscore-separated combos (after `-` → `_` normalization)
    SDD_TDD: "SDD+TDD",
    TDD_SDD: "SDD+TDD",
    SDD_EDD: "SDD+EDD",
    EDD_SDD: "SDD+EDD",
    TDD_EDD: "TDD+EDD",
    EDD_TDD: "TDD+EDD",
  };
  return aliases[normalized];
}

function normalizeAllowedWorkflows(value: unknown): Workflow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized = value
    .map((item) => normalizeWorkflow(String(item)))
    .filter((item): item is Workflow => Boolean(item));
  return normalized.length ? Array.from(new Set(normalized)) : undefined;
}

function requireTarget(value: string): Target {
  if (targets.includes(value as Target)) return value as Target;
  throw new Error(`Unsupported target: "${value}". Valid targets: ${targets.join(", ")}.`);
}

function parseBoolean(value: string): boolean {
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no", "off"].includes(value.toLowerCase())) return false;
  throw new Error(`Expected boolean value (true/false/yes/no), got: "${value}".`);
}

function requireContextBudget(value: string): "minimal" | "proportional" | "thorough" {
  if (value === "minimal" || value === "proportional" || value === "thorough") return value;
  throw new Error(`contextBudget must be "minimal", "proportional", or "thorough".`);
}

function parseAllowedWorkflows(value: string): Workflow[] {
  const items = value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Error(`allowedWorkflows must contain at least one workflow. Valid values: ${workflows.join(", ")}.`);
  }

  const parsed = items.map((item) => {
    const workflow = normalizeWorkflow(item);
    if (!workflow) {
      throw new Error(`Unsupported workflow in allowedWorkflows: "${item}". Valid values: ${workflows.join(", ")}.`);
    }
    return workflow;
  });

  return Array.from(new Set(parsed));
}
