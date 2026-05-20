export const targets = ["codex", "claude", "copilot", "pi"] as const;

export type Target = (typeof targets)[number];
export type TargetOption = Target | "all";

export const workflows = [
  "fast-patch",
  "research-first",
  "SDD",
  "TDD",
  "EDD",
  "SDD+TDD",
  "SDD+EDD",
  "TDD+EDD",
] as const;
export type Workflow = (typeof workflows)[number];
export type WorkflowDefault = Workflow | "task-fit";

/**
 * TaskWorkflow extends Workflow with "UI review", which is a valid task-level
 * recommendation but not a selectable config default.
 */
export type TaskWorkflow = Workflow | "UI review";

export interface JudgeConfig {
  enabled: boolean;
  trigger: "post-implementation";
}

export interface akrctxConfig {
  version: number;
  installedVersion?: string;
  judge?: JudgeConfig;
  targets: Target[];
  sourceOfTruth: ".akrctx";
  createdBy: "akrctx";
  defaults: {
    target?: Target;
    workflow: WorkflowDefault;
    allowedWorkflows: Workflow[];
    requireTaskCapsule: boolean;
    requireWorkflowReason: boolean;
    contextBudget: "minimal" | "proportional" | "thorough";
  };
  workflowRules: {
    default: WorkflowDefault;
    bugfix: Workflow;
    apiOrContract: Workflow;
    edgeCases: Workflow;
    ui: Workflow | "UI review";
    smallSafePatch: Workflow;
    unknownArea: Workflow;
  };
}

export type WriteKind = "create" | "update" | "preserve" | "suggest" | "skip";

export interface WriteResult {
  kind: WriteKind;
  path: string;
  reason?: string;
}

export interface CommandOptions {
  target?: TargetOption;
  workflow?: string;
  dryRun?: boolean;
  force?: boolean;
  json?: boolean;
  cwd?: string;
  nonInteractive?: boolean;
}

export interface DetectionResult {
  detected: Target[];
  evidence: Record<Target, string[]>;
}

export interface InitResult {
  target: TargetOption;
  selectedTargets: Target[];
  fallbackUsed: boolean;
  detection: DetectionResult;
  writes: WriteResult[];
  conflicts: string[];
}

export interface DoctorResult {
  installed: boolean;
  readiness: number;
  detectedTargets: Target[];
  installedTargets: Target[];
  missing: string[];
  conflicts: string[];
  suggestions: string[];
}
