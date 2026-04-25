import type { Target } from "../types.js";

export const targetReferenceTemplates: Record<Target, string> = {
  codex: "# Codex Target\n\nUse `AGENTS.md` and `.agents/skills/akrctx-*` as the primary akrctx harness.\n",
  claude:
    "# Claude Code Target\n\nUse `CLAUDE.md`, `.claude/skills/akrctx-*`, and `.claude/commands/` as the target adapter.\n",
  copilot:
    "# GitHub Copilot Target\n\nUse `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/`, and `.github/skills/akrctx-*` as the target adapter. Skills are the reusable workflow surface; prompts are for one-shot invocation.\n",
  pi: "# Pi Code Target\n\nUse `.pi/prompts/` and `.pi/skills/akrctx-*` as the target adapter.\n",
};

export function mainInstructionTemplate(target: Target): string {
  const heading =
    target === "claude" ? "CLAUDE.md" : target === "copilot" ? "GitHub Copilot Instructions" : "AGENTS.md";
  return `# ${heading} - akrctx

This repository uses akrctx as a local agentic workflow harness. Treat .akrctx/ as the workflow source of truth.

## Mandatory Behavior

When the user asks to implement a feature, fix, refactor, or meaningful code change:

1. Read .akrctx/config.json and .akrctx/policy.json.
2. Create or update a task capsule under .akrctx/tasks/TASK-XXX-.../ before implementation.
3. Record the chosen workflow and the reason in the capsule.
4. Follow the workflow from config unless the user explicitly overrides it.
5. Load only relevant context. Do not read all of .akrctx/ by default.
6. After implementation, update the task review checklist and run relevant validation.

Create the task capsule yourself — do not ask the user to run \`akrctx task\`. The CLI task command is a headless fallback for scripts and CI. During normal agent use, YOU are responsible for creating and filling the task capsule with real context from the codebase.

## Workflow Selection

Read the live values from .akrctx/config.json:

- defaults.workflow
- defaults.requireTaskCapsule
- defaults.requireWorkflowReason
- defaults.contextBudget
- workflowRules

If defaults.workflow is task-fit, choose the smallest workflow that fits the task. If it is concrete, use it unless the user explicitly asks otherwise.

## Write Policy

- Task capsules: .akrctx/tasks/TASK-XXX-.../
- Doctor findings: .akrctx/wiki/
- Compiled briefs: .akrctx/tasks/TASK-XXX-.../exports/
- Decisions: .akrctx/wiki/decisions.md
- Task implementation notes: .akrctx/tasks/TASK-XXX-.../log.md

## Safety

- Preserve existing instructions; use suggested files for conflicts.
- Do not read secrets or credentials (.env, *.pem, *.key, *.p12, *.pfx, secrets/, credentials/).
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
  "Detect existing Codex, Claude, Copilot, and Pi Code setup. Preserve all user-authored instruction files. Add missing akrctx structure and create suggested files for conflicts.";
const doctorBody =
  "Audit agent instructions, project docs, task templates, harness policy, and quality gates. Update .akrctx/wiki/ and propose instruction merges. Do not implement product features during doctor.";
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
  "Write durable context only to the paths in .akrctx/wiki/write-policy.md. Do not read all of .akrctx/ by default. Prefer the active task capsule, policy.json, and only relevant wiki pages.";

const sharedSkills = {
  "akrctx-init": ["Use when installing or reviewing the akrctx harness in a repository.", initBody],
  "akrctx-doctor": ["Use when auditing whether a repo is ready for AI coding agents.", doctorBody],
  "akrctx-task": [
    "Use when turning a development request into a akrctx task capsule.",
    taskBody,
  ],
  "akrctx-review": [
    "Use before or after implementation to verify task readiness, quality gates, tests, and scope.",
    reviewBody,
  ],
  "akrctx-workflow": [
    "Use when selecting or applying SDD, TDD, EDD, research-first, fast-patch, or combined workflows.",
    workflowBody,
  ],
  "akrctx-write-policy": [
    "Use when deciding where akrctx should persist wiki notes, task notes, decisions, or compiled briefs.",
    writePolicyBody,
  ],
} as const;

function skillFiles(prefix: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(sharedSkills).map(([name, [description, body]]) => [
      `${prefix}/${name}/SKILL.md`,
      skillTemplate(name, description, body),
    ]),
  );
}

export const codexSkills: Record<string, string> = skillFiles(".agents/skills");

export const claudeSkills: Record<string, string> = skillFiles(".claude/skills");

export const copilotSkills: Record<string, string> = skillFiles(".github/skills");

export const claudeCommands: Record<string, string> = {
  ".claude/commands/akrctx-doctor.md":
    "# akrctx Doctor\n\nUse the `akrctx-doctor` skill. Preserve existing instructions and update only `.akrctx/wiki/` unless approved.\n",
  ".claude/commands/akrctx-task.md":
    "# akrctx Task\n\nUse the `akrctx-task` skill. Create or refine a akrctx task capsule before implementation.\n",
};

export const copilotFiles: Record<string, string> = {
  ".github/instructions/akrctx.instructions.md": `---
applyTo: "**"
---

# akrctx Instructions

Use \`.akrctx/\` as the neutral source of truth. Preserve existing instruction files and avoid secrets. Do not read all of \`.akrctx/\` by default; open only the current task capsule, policy, and relevant wiki pages.
`,
  ".github/prompts/akrctx-doctor.prompt.md":
    "# akrctx Doctor\n\nAudit agent setup, wiki coverage, task templates, and quality gates. Propose safe merges instead of rewriting instructions. Do not implement product features during doctor.\n",
  ".github/prompts/akrctx-task.prompt.md":
    "# akrctx Task\n\nPrepare a task capsule with scope, context, acceptance criteria, and validation commands.\n",
  ".github/prompts/akrctx-workflow.prompt.md":
    "# akrctx Workflow\n\nApply the task capsule workflow: fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, or SDD+EDD. Keep the process proportional to task risk.\n",
  ".github/prompts/akrctx-write-policy.prompt.md":
    "# akrctx Write Policy\n\nWrite durable notes only to the akrctx write-policy paths. Do not overwrite existing instructions without human approval.\n",
};

export const piSkills: Record<string, string> = skillFiles(".pi/skills");

export const piFiles: Record<string, string> = {
  ".pi/prompts/akrctx-doctor.md":
    "# akrctx Doctor\n\nAudit this repository's akrctx setup and propose safe normalization.\n",
  ".pi/prompts/akrctx-task.md":
    "# akrctx Task\n\nPrepare a akrctx task capsule before implementation.\n",
  ".pi/prompts/akrctx-workflow.md":
    "# akrctx Workflow\n\nUse the task capsule workflow. Supported modes: fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, SDD+EDD.\n",
  ".pi/prompts/akrctx-write-policy.md":
    "# akrctx Write Policy\n\nPersist notes only in approved akrctx paths. Do not read all of `.akrctx/` by default.\n",
};
