import type { Profile, Target, akrctxConfig, akrctxPolicy } from "../types.js";
import { workflows } from "../types.js";
import { CLI_VERSION } from "../version.js";

export function configTemplate(targets: Target[], profile: Profile = "default"): string {
  return JSON.stringify(defaultConfig(targets, profile), null, 2);
}

export function defaultConfig(targets: Target[], profile: Profile = "default"): akrctxConfig {
  const config: akrctxConfig = {
    version: 1,
    installedVersion: CLI_VERSION,
    profile,
    judge: { enabled: false, trigger: "post-implementation" },
    comprehensionGate: {
      enabled: false,
      trigger: "agent-assessed-significance",
      evaluationMode: "prefer-independent",
    },
    targets,
    templatePacks: [],
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

  if (profile === "strict" || profile === "regulated") {
    config.defaults.contextBudget = "thorough";
  }

  if (profile === "regulated") {
    config.workflowRules.smallSafePatch = "TDD";
    config.workflowRules.default = "research-first";
  }

  return config;
}

/** Ignores everything a directory holds while keeping the rule itself trackable. */
export const selfIgnoringDirectoryTemplate = "*\n!.gitignore\n";

/** Keeps personal comprehension responses out of version control by default. */
export const localComprehensionIgnoreTemplate = selfIgnoringDirectoryTemplate;

/** Keeps upgrade candidates, which are suggestions nobody accepted yet, out of the diff. */
export const upgradesIgnoreTemplate = selfIgnoringDirectoryTemplate;

export function policyTemplate(profile: Profile = "default"): string {
  return JSON.stringify(defaultPolicy(profile), null, 2);
}

export function defaultPolicy(profile: Profile = "default"): akrctxPolicy {
  const policy: akrctxPolicy = {
    version: 1,
    profile,
    mergeStrategy: "preserve-and-suggest",
    protectedFiles: ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md", ".pi/README.md"],
    protectedFileMerge: {
      agentMayEdit: "after-explicit-human-approval",
      approvalScope: "current-conversation",
      requireDiffPreview: true,
    },
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
      doctor: [
        ".akrctx/wiki/agent-setup.md",
        ".akrctx/wiki/gaps.md",
        ".akrctx/wiki/recommendations.md",
        ".akrctx/wiki/instruction-audit.md",
        "AGENTS.akrctx.suggested.md",
        "CLAUDE.akrctx.suggested.md",
        ".github/copilot-instructions.akrctx.suggested.md",
      ],
      task: [".akrctx/tasks/TASK-XXX/"],
      compile: [".akrctx/tasks/TASK-XXX/exports/<target>.md"],
      decisions: [".akrctx/wiki/decisions.md"],
      implementationNotes: [".akrctx/tasks/TASK-XXX/log.md"],
    },
  };

  if (profile === "strict" || profile === "regulated") {
    policy.blockedReadPatterns = [
      ...policy.blockedReadPatterns,
      ".npmrc",
      ".netrc",
      ".ssh/",
      "id_rsa",
      "id_dsa",
      "id_ecdsa",
      "id_ed25519",
    ];
  }

  if (profile === "regulated") {
    policy.blockedReadPatterns = [
      ...policy.blockedReadPatterns,
      "*.mobileprovision",
      "*.keystore",
      "*.jks",
      "*.asc",
      "*.gpg",
      "compliance/",
    ];
  }

  return {
    ...policy,
    blockedReadPatterns: Array.from(new Set(policy.blockedReadPatterns)),
  };
}
