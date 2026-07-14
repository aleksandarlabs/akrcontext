export const targets = ["codex", "claude", "copilot", "pi"] as const;

export type Target = (typeof targets)[number];
export type TargetOption = Target | "all";

export const profiles = ["default", "strict", "regulated"] as const;
export type Profile = (typeof profiles)[number];

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

export interface ComprehensionGateConfig {
  enabled: boolean;
  trigger: "agent-assessed-significance";
  evaluationMode: "prefer-independent";
}

export type ComprehensionSignificance = "surface" | "logic" | "architectural" | "critical";
export type ComprehensionEvaluationMode = "independent" | "fresh-context";
export type ComprehensionResultStatus =
  | "VERIFIED"
  | "ASSISTED"
  | "UNVERIFIED"
  | "INVALID_GATE"
  | "SKIPPED"
  | "DEFERRED";

export interface akrctxConfig {
  version: number;
  installedVersion?: string;
  profile?: Profile;
  judge?: JudgeConfig;
  comprehensionGate: ComprehensionGateConfig;
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

export interface akrctxPolicy {
  version: number;
  profile?: Profile;
  mergeStrategy: "preserve-and-suggest";
  protectedFiles: string[];
  blockedReadPatterns: string[];
  contextBudget: {
    rootInstructions: "minimal" | "proportional" | "thorough";
    loadWorkflowsOnDemand: boolean;
    doNotReadAllByDefault: boolean;
  };
  enforcement: {
    requireTaskCapsule: boolean;
    requireWorkflowReason: boolean;
    requireAcceptanceCriteria: boolean;
    requireReviewChecklist: boolean;
  };
  writePolicy: {
    doctor: string[];
    task: string[];
    compile: string[];
    decisions: string[];
    implementationNotes: string[];
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
  ci?: boolean;
  fix?: boolean;
  profile?: Profile;
  template?: string;
  templatePack?: string;
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
  detection: DetectionResult;
  writes: WriteResult[];
  conflicts: string[];
  policyWarnings: string[];
}

export type SuggestionSeverity = "info" | "warning" | "error";

export interface Suggestion {
  text: string;
  severity: SuggestionSeverity;
}

export interface DoctorResult {
  installed: boolean;
  readiness: number;
  detectedTargets: Target[];
  installedTargets: Target[];
  missing: string[];
  conflicts: string[];
  suggestions: Suggestion[];
  fixed?: string[];
  wikiLint?: WikiLintResult;
}

export interface WikiLintIssue {
  file: string;
  message: string;
}

export interface WikiLintResult {
  brokenLinks: WikiLintIssue[];
  orphans: string[];
  missingTimestamps: WikiLintIssue[];
}
