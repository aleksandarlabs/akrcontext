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
  trigger: string;
}

export const agentNames = ["judge", "comprehension", "implementer"] as const;
export type AgentName = (typeof agentNames)[number];

/** Pi is a supported akrctx target but has no agent format. */
export type AgentTarget = Exclude<Target, "pi">;

export type AgentModelConfig = Partial<Record<AgentTarget, string>>;

export interface AgentEntryConfig {
  enabled?: boolean;
  trigger?: string;
  targets?: Target[];
  model?: AgentModelConfig;
  /** Implementer only. Positive integer; an invalid value is an error, not a warning. */
  maxAttempts?: number;
}

export interface AgentsConfig {
  judge?: AgentEntryConfig;
  comprehension?: AgentEntryConfig;
  implementer?: AgentEntryConfig;
  /** An entry a newer akrctx knows and this one does not. Preserved verbatim, never resolved. */
  [entry: string]: AgentEntryConfig | unknown;
}

export interface ResolvedAgent {
  name: AgentName;
  enabled: boolean;
  trigger: string;
  /** Explicit narrowing from config. Absent means every installed target with a format. */
  configuredTargets?: Target[];
  /** Installed targets with a format for this agent, after narrowing. */
  targets: AgentTarget[];
  model: AgentModelConfig;
  maxAttempts: number;
}

/** Phase-1 session tracing. Absent means off: installing akrctx never starts recording. */
export interface TraceConfig {
  enabled: boolean;
}

export interface ComprehensionGateConfig {
  enabled: boolean;
  trigger: string;
  evaluationMode: "prefer-independent";
}

/** Legacy opt-in gate for the implementer, superseded by `agents.implementer`. */
export interface ImplConfig {
  enabled: boolean;
}

export interface AppliedTemplatePack {
  name: string;
  version: string;
  source: "bundled" | "local";
  targets: Target[];
  fileHashes: Record<string, string>;
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
  impl?: ImplConfig;
  agents?: AgentsConfig;
  trace?: TraceConfig;
  comprehensionGate: ComprehensionGateConfig;
  targets: Target[];
  templatePacks: AppliedTemplatePack[];
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
  protectedFileMerge: {
    agentMayEdit: "after-explicit-human-approval";
    approvalScope: "current-conversation";
    requireDiffPreview: true;
  };
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
  repair?: boolean;
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
  agentTargetWarnings: string[];
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
