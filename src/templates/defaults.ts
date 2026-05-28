import type { Target, akrctxConfig, akrctxPolicy } from "../types.js";
import { workflows } from "../types.js";
import { CLI_VERSION } from "../version.js";

export function configTemplate(targets: Target[]): string {
  return JSON.stringify(defaultConfig(targets), null, 2);
}

export function defaultConfig(targets: Target[]): akrctxConfig {
  return {
    version: 1,
    installedVersion: CLI_VERSION,
    judge: { enabled: false, trigger: "post-implementation" },
    targets,
    sourceOfTruth: ".akrctx",
    createdBy: "akrctx",
    defaults: {
      target: targets[0],
      workflow: "task-fit",
      allowedWorkflows: [...workflows],
      requireTaskCapsule: true,
      requireWorkflowReason: true,
      contextBudget: "proportional",
    },
    workflowRules: {
      default: "task-fit",
      bugfix: "TDD",
      apiOrContract: "SDD+TDD",
      edgeCases: "SDD+EDD",
      ui: "UI review",
      smallSafePatch: "fast-patch",
      unknownArea: "research-first",
    },
  };
}

export function policyTemplate(): string {
  return JSON.stringify(defaultPolicy(), null, 2);
}

export function defaultPolicy(): akrctxPolicy {
  return {
    version: 1,
    mergeStrategy: "preserve-and-suggest",
    protectedFiles: ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md"],
    blockedReadPatterns: [".env", ".env.*", "*.pem", "*.key", "*.p12", "*.pfx", "secrets/", "credentials/", "private/"],
    contextBudget: {
      rootInstructions: "minimal",
      loadWorkflowsOnDemand: true,
      doNotReadAllByDefault: true,
    },
    enforcement: {
      requireTaskCapsule: true,
      requireWorkflowReason: true,
      requireAcceptanceCriteria: true,
      requireReviewChecklist: true,
    },
    writePolicy: {
      doctor: [".akrctx/wiki/agent-setup.md", ".akrctx/wiki/gaps.md", ".akrctx/wiki/recommendations.md"],
      task: [".akrctx/tasks/TASK-XXX/"],
      compile: [".akrctx/tasks/TASK-XXX/exports/<target>.md"],
      decisions: [".akrctx/wiki/decisions.md"],
      implementationNotes: [".akrctx/tasks/TASK-XXX/log.md"],
    },
  };
}
