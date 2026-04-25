import type { ContextForgeConfig, Target } from "./types.js";
import { workflows } from "./types.js";

export function configTemplate(targets: Target[]): string {
  return JSON.stringify(defaultConfig(targets), null, 2);
}

export function defaultConfig(targets: Target[]): ContextForgeConfig {
  return {
    version: 1,
    targets,
    sourceOfTruth: ".contextforge",
    createdBy: "contextforge",
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
  return JSON.stringify(
    {
      version: 1,
      mergeStrategy: "preserve-and-suggest",
      blockedReadPatterns: [".env", ".env.*", "*.pem", "*.key", "secrets/", "credentials/", "private/"],
      contextBudget: {
        rootInstructions: "minimal",
        loadWorkflowsOnDemand: true,
        doNotReadAllContextforgeByDefault: true,
      },
      writePolicy: {
        doctor: [".contextforge/wiki/agent-setup.md", ".contextforge/wiki/gaps.md", ".contextforge/wiki/recommendations.md"],
        task: [".contextforge/tasks/TASK-XXX/"],
        compile: [".contextforge/tasks/TASK-XXX/exports/<target>.md"],
        decisions: [".contextforge/wiki/decisions.md"],
        implementationNotes: [".contextforge/tasks/TASK-XXX/log.md"],
      },
    },
    null,
    2,
  );
}

export const wikiTemplates: Record<string, string> = {
  "wiki/overview.md": "# Overview\n\nContextForge is installed in this repository as a neutral source of truth for agentic workflows.\n",
  "wiki/architecture.md": "# Architecture\n\nDocument the project architecture here as the agent learns it.\n",
  "wiki/conventions.md": "# Conventions\n\nDocument coding, naming, and review conventions here.\n",
  "wiki/testing.md": "# Testing\n\nDocument build, test, lint, and validation commands here.\n",
  "wiki/workflows.md":
    `# Workflows

Use ContextForge task capsules before implementation.

## Project Default

The project default lives in .contextforge/config.json:

- defaults.workflow: task-fit means choose the smallest workflow that fits the task.
- defaults.requireWorkflowReason: true means each task capsule should explain why the workflow was chosen.
- defaults.contextBudget: proportional means load only context that is useful for the current task.

## Supported Labels

- fast-patch
- research-first
- SDD
- TDD
- EDD
- SDD+TDD
- SDD+EDD
- TDD+EDD

## Selection Policy

- Use fast-patch for small, low-risk changes.
- Use TDD for bugs, regressions, and testable logic changes.
- Use SDD for APIs, contracts, schemas, permissions, and behavior specifications.
- Use SDD+TDD for new or changed contracts that need executable tests.
- Use EDD for examples, edge cases, and ambiguous rules.
- Use SDD+EDD for domains with many examples or boundary cases.
- Use research-first when the relevant area is unknown.
`,
  "wiki/decisions.md": "# Decisions\n\nRecord important project and agent-workflow decisions here.\n",
  "wiki/agent-setup.md": "# Agent Setup\n\nContextForge preserves existing agent instructions and writes suggested files when conflicts exist.\n",
  "wiki/write-policy.md": `# Write Policy

ContextForge keeps root instructions small and writes durable context only when it has a clear home.

## Where To Write

- Doctor findings: .contextforge/wiki/agent-setup.md, gaps.md, recommendations.md
- Task capsules: .contextforge/tasks/TASK-XXX/
- Compiled briefs: .contextforge/tasks/TASK-XXX/exports/<target>.md
- Architecture or process decisions: .contextforge/wiki/decisions.md
- Implementation notes for a task: .contextforge/tasks/TASK-XXX/log.md

## Context Budget

- Do not read all of .contextforge/ by default.
- Read policy.json first when safety or merge behavior matters.
- Read the current task capsule before implementation.
- Read only wiki pages that are relevant to the current task.
- Load target workflow skills or prompts only when the task calls for them.
`,
  "wiki/log.md": "# Log\n\n- ContextForge initialized.\n",
};

export const taskTemplateFiles: Record<string, string> = {
  "tasks/_template/task.md": "# Task\n\n## Goal\n\nDescribe the requested change.\n\n## Out Of Scope\n\n- Work outside this task capsule's agreed scope.\n",
  "tasks/_template/context.md": "# Context\n\n## Relevant Files\n\n- To be filled by the agent.\n\n## Blocked Reads\n\n- Secrets and credentials must not be read.\n",
  "tasks/_template/plan.md":
    "# Plan\n\n## Workflow\n\n- research-first\n\n## Steps\n\n1. Inspect relevant context.\n2. Confirm scope.\n3. Implement only after context is ready.\n",
  "tasks/_template/review-checklist.md":
    "# Review Checklist\n\n- [ ] Goal is clear.\n- [ ] Scope is controlled.\n- [ ] Tests or validation commands are defined.\n- [ ] Existing instructions were not overwritten.\n",
};

export const targetReferenceTemplates: Record<Target, string> = {
  codex: "# Codex Target\n\nUse `AGENTS.md` and `.agents/skills/contextforge-*` as the primary ContextForge harness.\n",
  claude: "# Claude Code Target\n\nUse `CLAUDE.md`, `.claude/skills/contextforge-*`, and `.claude/commands/` as the target adapter.\n",
  copilot:
    "# GitHub Copilot Target\n\nUse `.github/copilot-instructions.md`, `.github/instructions/`, and `.github/prompts/` as the target adapter. Copilot prompt files are the reusable workflow surface.\n",
  pi: "# Pi Code Target\n\nUse `.pi/prompts/` and `.pi/skills/contextforge-*` as the target adapter.\n",
};

export function mainInstructionTemplate(target: Target): string {
  const heading = target === "claude" ? "CLAUDE.md" : target === "copilot" ? "GitHub Copilot Instructions" : "AGENTS.md";
  return `# ${heading} - ContextForge

This repository uses ContextForge as a local agentic workflow harness. Treat .contextforge/ as the workflow source of truth.

## Mandatory Behavior

When the user asks to implement a feature, fix, refactor, or meaningful code change:

1. Read .contextforge/config.json and .contextforge/policy.json.
2. Create or update a task capsule under .contextforge/tasks/TASK-XXX-.../ before implementation.
3. Record the chosen workflow and the reason in the capsule.
4. Follow the workflow from config unless the user explicitly overrides it.
5. Load only relevant context. Do not read all of .contextforge/ by default.
6. After implementation, update the task review checklist and run relevant validation.

Do not ask the user to run contextforge task during normal agent use. The CLI task command is only a headless fallback.

## Workflow Selection

Read the live values from .contextforge/config.json:

- defaults.workflow
- defaults.requireTaskCapsule
- defaults.requireWorkflowReason
- defaults.contextBudget
- workflowRules

If defaults.workflow is task-fit, choose the smallest workflow that fits the task. If it is concrete, use it unless the user explicitly asks otherwise.

## Write Policy

- Task capsules: .contextforge/tasks/TASK-XXX-.../
- Doctor findings: .contextforge/wiki/
- Compiled briefs: .contextforge/tasks/TASK-XXX-.../exports/
- Decisions: .contextforge/wiki/decisions.md
- Task implementation notes: .contextforge/tasks/TASK-XXX-.../log.md

## Safety

- Preserve existing instructions; use suggested files for conflicts.
- Do not read secrets or credentials.
- Keep root instructions minimal. Load detailed workflows from target skills/prompts only when relevant.
`;
}

function skillTemplate(name: string, description: string, body: string): string {
  return `---
name: ${name}
description: ${description}
---

# ${name}

${body}
`;
}

const initBody =
  "Detect existing Codex, Claude, Copilot, and Pi Code setup. Preserve all user-authored instruction files. Add missing ContextForge structure and create suggested files for conflicts.";
const doctorBody =
  "Audit agent instructions, project docs, task templates, harness policy, and quality gates. Update .contextforge/wiki/ and propose instruction merges. Do not implement product features during doctor.";
const taskBody =
  "Turn the request into a task capsule with goal, scope, context, explicit workflow choice, acceptance criteria, validation commands, and an implementation brief. Do not invent unknowns; record open questions.";
const reviewBody =
  "Check whether the task capsule is ready: goal clarity, testability, relevant context, blocked secrets, scope control, validation commands, and human-approved merge strategy.";
const workflowBody = `Use the workflow named in the task capsule.

## Workflow Modes

- fast-patch: minimal context, smallest safe change.
- research-first: inspect and summarize uncertainty before coding.
- SDD: write or update behavior/spec contract before implementation.
- TDD: write or update failing tests before implementation.
- EDD: define examples and edge cases before implementation.
- SDD+TDD: specify behavior first, then encode it in tests.
- SDD+EDD: specify behavior first, then add examples and edge cases.

Do not expand into a heavyweight process unless the task capsule or user explicitly asks for it.`;
const writePolicyBody =
  "Write durable ContextForge context only to the paths listed in .contextforge/wiki/write-policy.md. Do not read all of .contextforge/ by default. Prefer the active task capsule, policy.json, and only relevant wiki pages.";

const sharedSkills = {
  "contextforge-init": ["Use when installing or reviewing the ContextForge harness in a repository.", initBody],
  "contextforge-doctor": ["Use when auditing whether a repo is ready for AI coding agents.", doctorBody],
  "contextforge-task": ["Use when turning a development request into a ContextForge task capsule.", taskBody],
  "contextforge-review": ["Use before or after implementation to verify task readiness, quality gates, tests, and scope.", reviewBody],
  "contextforge-workflow": ["Use when selecting or applying SDD, TDD, EDD, research-first, fast-patch, or combined workflows.", workflowBody],
  "contextforge-write-policy": [
    "Use when deciding where ContextForge should persist wiki notes, task notes, decisions, or compiled briefs.",
    writePolicyBody,
  ],
} as const;

function skillFiles(prefix: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(sharedSkills).map(([name, [description, body]]) => [`${prefix}/${name}/SKILL.md`, skillTemplate(name, description, body)]),
  );
}

export const codexSkills: Record<string, string> = skillFiles(".agents/skills");

export const claudeSkills: Record<string, string> = skillFiles(".claude/skills");

export const claudeCommands: Record<string, string> = {
  ".claude/commands/contextforge-doctor.md":
    "# ContextForge Doctor\n\nUse the `contextforge-doctor` skill. Preserve existing instructions and update only `.contextforge/wiki/` unless approved.\n",
  ".claude/commands/contextforge-task.md":
    "# ContextForge Task\n\nUse the `contextforge-task` skill. Create or refine a ContextForge task capsule before implementation.\n",
};

export const copilotFiles: Record<string, string> = {
  ".github/instructions/contextforge.instructions.md": `---
applyTo: "**"
---

# ContextForge Instructions

Use `.contextforge/` as the neutral source of truth. Preserve existing instruction files and avoid secrets. Do not read all of `.contextforge/` by default; open only the current task capsule, policy, and relevant wiki pages.
`,
  ".github/prompts/contextforge-doctor.prompt.md":
    "# ContextForge Doctor\n\nAudit agent setup, wiki coverage, task templates, and quality gates. Propose safe merges instead of rewriting instructions. Do not implement product features during doctor.\n",
  ".github/prompts/contextforge-task.prompt.md":
    "# ContextForge Task\n\nPrepare a task capsule with scope, context, acceptance criteria, and validation commands.\n",
  ".github/prompts/contextforge-workflow.prompt.md":
    "# ContextForge Workflow\n\nApply the task capsule workflow: fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, or SDD+EDD. Keep the process proportional to task risk.\n",
  ".github/prompts/contextforge-write-policy.prompt.md":
    "# ContextForge Write Policy\n\nWrite durable notes only to the ContextForge write-policy paths. Do not overwrite existing instructions without human approval.\n",
};

export const piSkills: Record<string, string> = skillFiles(".pi/skills");

export const piFiles: Record<string, string> = {
  ".pi/prompts/contextforge-doctor.md": "# ContextForge Doctor\n\nAudit this repository's ContextForge setup and propose safe normalization.\n",
  ".pi/prompts/contextforge-task.md": "# ContextForge Task\n\nPrepare a ContextForge task capsule before implementation.\n",
  ".pi/prompts/contextforge-workflow.md":
    "# ContextForge Workflow\n\nUse the task capsule workflow. Supported modes: fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, SDD+EDD.\n",
  ".pi/prompts/contextforge-write-policy.md":
    "# ContextForge Write Policy\n\nPersist notes only in approved ContextForge paths. Do not read all of `.contextforge/` by default.\n",
};
