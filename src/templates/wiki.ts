export function overviewTemplate(projectName: string, targets: string[], installedVersion: string): string {
  return `# Overview

**Project:** ${projectName}
**akrctx version:** ${installedVersion}
**Installed targets:** ${targets.join(", ")}

This repository uses akrctx as an agentic workflow harness. The \`.akrctx/\` directory is the neutral source of truth.

## Quick Reference

- Workflows: fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, SDD+EDD, TDD+EDD, UI review
- Default workflow: read from \`.akrctx/config.json\` → \`defaults.workflow\`
- Task capsules: \`.akrctx/tasks/TASK-XXX/\`
- Wiki: \`.akrctx/wiki/\` (populated by \`akrctx doctor\`)

## Next Steps

Ask your agent: "Run akrctx doctor." It will audit this setup and populate the wiki.
`;
}

export const wikiTemplates: Record<string, string> = {
  "wiki/architecture.md": "# Architecture\n\nDocument the project architecture here as the agent learns it.\n",
  "wiki/conventions.md": "# Conventions\n\nDocument coding, naming, and review conventions here.\n",
  "wiki/testing.md": "# Testing\n\nDocument build, test, lint, and validation commands here.\n",
  "wiki/workflows.md": `# Workflows

Use akrctx task capsules before implementation.

## Project Default

The project default lives in .akrctx/config.json:

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
- UI review (auto-assigned for UI tasks, not a user-selectable default)

## Selection Policy

- Use fast-patch for small, low-risk changes.
- Use TDD for bugs, regressions, and testable logic changes.
- Use SDD for APIs, contracts, schemas, permissions, and behavior specifications.
- Use SDD+TDD for new or changed contracts that need executable tests.
- Use EDD for examples, edge cases, and ambiguous rules.
- Use SDD+EDD for domains with many examples or boundary cases.
- Use research-first when the relevant area is unknown.
- Use UI review for UI validation tasks (discovers stylelint, storybook, playwright, etc.).
`,
  "wiki/decisions.md": "# Decisions\n\nRecord important project and agent-workflow decisions here.\n",
  "wiki/agent-setup.md":
    "# Agent Setup\n\nakrctx preserves existing agent instructions and writes suggested files when conflicts exist.\n",
  "wiki/write-policy.md": `# Write Policy

akrctx keeps root instructions small and writes durable context only when it has a clear home.

## Where To Write

- Doctor findings: .akrctx/wiki/agent-setup.md, gaps.md, recommendations.md
- Task capsules: .akrctx/tasks/TASK-XXX/
- Compiled briefs: .akrctx/tasks/TASK-XXX/exports/<target>.md
- Architecture or process decisions: .akrctx/wiki/decisions.md
- Implementation notes for a task: .akrctx/tasks/TASK-XXX/log.md

## Context Budget

- Do not read all of .akrctx/ by default.
- Read policy.json first when safety or merge behavior matters.
- Read the current task capsule before implementation.
- Read only wiki pages that are relevant to the current task.
- Load target workflow skills or prompts only when the task calls for them.
`,
  "wiki/log.md": "# Log\n\n- akrctx initialized.\n",
};

export const taskTemplateFiles: Record<string, string> = {
  "tasks/_template/task.md":
    "# Task\n\n## Goal\n\nDescribe the requested change.\n\n## Out Of Scope\n\n- Work outside this task capsule's agreed scope.\n",
  "tasks/_template/context.md":
    "# Context\n\n## Relevant Files\n\n- To be filled by the agent.\n\n## Blocked Reads\n\n- Secrets and credentials must not be read.\n",
  "tasks/_template/plan.md":
    "# Plan\n\n## Workflow\n\n- research-first\n\n## Steps\n\n1. Inspect relevant context.\n2. Confirm scope.\n3. Implement only after context is ready.\n",
  "tasks/_template/review-checklist.md":
    "# Review Checklist\n\n- [ ] Goal is clear.\n- [ ] Scope is controlled.\n- [ ] Tests or validation commands are defined.\n- [ ] Existing instructions were not overwritten.\n",
};
