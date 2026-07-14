import { readFile, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs-utils.js";
import { defaultConfig } from "./templates.js";
import type { AppliedTemplatePack, Target, Workflow, WorkflowDefault, akrctxConfig } from "./types.js";
import { targets, workflows } from "./types.js";

const configPath = ".akrctx/config.json";

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
] as const;

export async function readConfig(cwd: string): Promise<akrctxConfig | undefined> {
  const absolute = path.join(cwd, configPath);
  if (!(await pathExists(absolute))) return undefined;
  try {
    return normalizeConfig(JSON.parse(await readFile(absolute, "utf8")));
  } catch {
    return undefined;
  }
}

/**
 * Like readConfig, but distinguishes a missing config (returns undefined)
 * from a corrupt one (throws). Use this wherever following the "not found"
 * advice (running `akrctx init`) could clobber a broken config that a human
 * needs to inspect first.
 */
export async function readConfigStrict(cwd: string): Promise<akrctxConfig | undefined> {
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

export async function writeConfig(cwd: string, config: akrctxConfig, dryRun = false): Promise<void> {
  if (dryRun) return;
  const absolute = path.join(cwd, configPath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export function normalizeConfig(raw: unknown): akrctxConfig {
  if (!raw || typeof raw !== "object") {
    return defaultConfig(["codex"]);
  }
  const partial = raw as Partial<akrctxConfig>;
  const configuredTargets = Array.isArray(partial.targets)
    ? partial.targets.filter((target): target is Target => targets.includes(target as Target))
    : [];
  const base = defaultConfig(configuredTargets.length ? configuredTargets : ["codex"]);

  return {
    ...base,
    ...partial,
    targets: configuredTargets.length ? configuredTargets : base.targets,
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
  };
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
    trigger: gate.trigger === "agent-assessed-significance" ? gate.trigger : fallback.trigger,
    evaluationMode: gate.evaluationMode === "prefer-independent" ? gate.evaluationMode : fallback.evaluationMode,
  };
}

export async function setConfigValue(cwd: string, key: string, value: string, dryRun = false): Promise<akrctxConfig> {
  const normalizedKey = key.trim();

  if (!(validConfigKeys as readonly string[]).includes(normalizedKey)) {
    throw new Error(`Unsupported config key: "${normalizedKey}". Valid keys: ${validConfigKeys.join(", ")}.`);
  }

  const current = (await readConfigStrict(cwd)) ?? defaultConfig(["codex"]);
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
  }

  await writeConfig(cwd, next, dryRun);
  return next;
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
