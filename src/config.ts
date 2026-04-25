import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { mkdir } from "node:fs/promises";
import { pathExists } from "./fs-utils.js";
import { defaultConfig } from "./templates.js";
import type { akrctxConfig, Target, Workflow, WorkflowDefault } from "./types.js";
import { targets, workflows } from "./types.js";

const configPath = ".akrctx/config.json";

const validConfigKeys = [
  "defaultWorkflow",
  "defaults.workflow",
  "defaultTarget",
  "defaults.target",
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
  };
}

export async function setConfigValue(cwd: string, key: string, value: string, dryRun = false): Promise<akrctxConfig> {
  const normalizedKey = key.trim();

  if (!(validConfigKeys as readonly string[]).includes(normalizedKey)) {
    throw new Error(
      `Unsupported config key: "${normalizedKey}". Valid keys: ${validConfigKeys.join(", ")}.`,
    );
  }

  const current = (await readConfig(cwd)) ?? defaultConfig(["codex"]);
  const next = structuredClone(current);

  if (normalizedKey === "defaultWorkflow" || normalizedKey === "defaults.workflow") {
    next.defaults.workflow = requireWorkflowDefault(value);
  } else if (normalizedKey === "defaultTarget" || normalizedKey === "defaults.target") {
    next.defaults.target = requireTarget(value);
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
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "_");

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
  const normalized = value.map((item) => normalizeWorkflow(String(item))).filter((item): item is Workflow => Boolean(item));
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
