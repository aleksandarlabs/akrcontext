import type { DoctorResult, Suggestion, WikiLintResult } from "../types.js";

export function wikiFrontmatter(
  type: string,
  title: string,
  description: string,
  tags: string[] = [],
  timestamp: string = new Date().toISOString(),
): string {
  const tagList = tags.map((tag) => JSON.stringify(tag)).join(", ");
  return `---\ntype: ${type}\ntitle: ${JSON.stringify(title)}\ndescription: ${JSON.stringify(description)}\ntags: [${tagList}]\ntimestamp: ${timestamp}\n---\n\n`;
}

export function overviewTemplate(projectName: string, targets: string[], installedVersion: string): string {
  return `${wikiFrontmatter("akrctx-wiki-overview", "Overview", `Project overview for ${projectName}.`, ["overview", "akrctx"])}# Overview

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

export function agentSetupTemplate(result: DoctorResult): string {
  return `${wikiFrontmatter("akrctx-wiki-agent-setup", "Agent Setup", "Readiness report for the akrctx harness.", ["agent-setup", "doctor"])}# Agent Setup

Agent readiness: ${result.readiness}/100

## Detected Targets

${result.detectedTargets.length ? result.detectedTargets.map((target) => `- ${target}`).join("\n") : "- None"}

## Installed Targets

${result.installedTargets.length ? result.installedTargets.map((target) => `- ${target}`).join("\n") : "- None"}

## Missing Files

${result.missing.length ? result.missing.map((file) => `- ${file}`).join("\n") : "- None"}

## Human-Approved Merge Needed

${result.conflicts.length ? result.conflicts.map((conflict) => `- ${conflict}`).join("\n") : "- None"}

## Suggested Safe Next Steps

${result.suggestions.map((suggestion) => `- [${suggestion.severity}] ${suggestion.text}`).join("\n")}
`;
}

export interface GapSection {
  heading: string;
  items: string[];
}

export function gapsTemplate(sections: GapSection[], wikiLint?: WikiLintResult): string {
  let body = "";
  for (const section of sections) {
    if (section.items.length === 0) continue;
    body += `## ${section.heading}\n\n${section.items.map((item) => `- ${item}`).join("\n")}\n\n`;
  }
  if (wikiLint?.brokenLinks.length) {
    body += `## Wiki lint: broken links\n\n${wikiLint.brokenLinks.map((issue) => `- ${issue.file}: ${issue.message}`).join("\n")}\n\n`;
  }
  if (wikiLint?.missingTimestamps.length) {
    body += `## Wiki lint: missing timestamps\n\n${wikiLint.missingTimestamps.map((issue) => `- ${issue.file}: ${issue.message}`).join("\n")}\n\n`;
  }
  if (!body) body = "- No gaps detected.\n";
  return `${wikiFrontmatter("akrctx-wiki-gaps", "Gaps", "Identified gaps in the akrctx harness.", ["gaps", "doctor"])}# Gaps

${body}`;
}

export function recommendationsTemplate(recommendations: Suggestion[]): string {
  const body = recommendations.length
    ? recommendations.map((recommendation) => `- [${recommendation.severity}] ${recommendation.text}`).join("\n")
    : "- No actionable recommendations.";
  return `${wikiFrontmatter("akrctx-wiki-recommendations", "Recommendations", "Suggested next steps for the akrctx harness.", ["recommendations", "doctor"])}# Recommendations

${body}
`;
}

export const wikiTemplates: Record<string, string> = {
  "wiki/architecture.md": `${wikiFrontmatter("akrctx-wiki-architecture", "Architecture", "Project architecture discovered by the agent.", ["architecture"])}# Architecture

Document the project architecture here as the agent learns it.

When you discover a significant pattern, dependency, or boundary, add it to this page. Keep it concise and cross-link to relevant files or decisions.
`,

  "wiki/conventions.md": `${wikiFrontmatter("akrctx-wiki-conventions", "Conventions", "Coding, naming, and review conventions discovered by the agent.", ["conventions"])}# Conventions

Document coding, naming, and review conventions here.

When you identify a convention the project follows, add it with a short example. Do not invent conventions that are not evidenced in the codebase.
`,

  "wiki/testing.md": `${wikiFrontmatter("akrctx-wiki-testing", "Testing", "Build, test, lint, and validation commands for the project.", ["testing"])}# Testing

Document build, test, lint, and validation commands here.

When you verify a command works, record it here with its purpose. Prefer commands from package.json scripts when they exist.
`,

  "wiki/workflows.md": `${wikiFrontmatter("akrctx-wiki-workflows", "Workflows", "Supported akrctx workflows and selection policy.", ["workflows", "akrctx"])}# Workflows

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

  "wiki/decisions.md": `${wikiFrontmatter("akrctx-wiki-decisions", "Decisions", "Important project and agent-workflow decisions.", ["decisions"])}# Decisions

Record important project and agent-workflow decisions here.

Include the date, the decision, the context, and the consequences. Link to relevant issues, PRs, or wiki pages when possible.
`,

  "wiki/agent-setup.md": `${wikiFrontmatter("akrctx-wiki-agent-setup", "Agent Setup", "Readiness report for the akrctx harness.", ["agent-setup", "doctor"])}# Agent Setup

akrctx preserves existing agent instructions and writes suggested files when conflicts exist.
`,

  // biome-ignore format: preserve markdown in template literal
  "wiki/write-policy.md": `${wikiFrontmatter("akrctx-wiki-write-policy", "Write Policy", "Where akrctx and agents should persist durable context.", ["write-policy", "akrctx"])}# Write Policy

akrctx keeps root instructions small and writes durable context only when it has a clear home.

## Where To Write

- Wiki index: .akrctx/wiki/index.md
- Doctor findings: .akrctx/wiki/agent-setup.md, gaps.md, recommendations.md
- Doctor merge candidates: AGENTS.akrctx.suggested.md, CLAUDE.akrctx.suggested.md, .github/copilot-instructions.akrctx.suggested.md
- Task capsules: .akrctx/tasks/TASK-XXX/
- Compiled briefs: .akrctx/tasks/TASK-XXX/exports/<target>.md
- Architecture or process decisions: .akrctx/wiki/decisions.md
- Implementation notes for a task: .akrctx/tasks/TASK-XXX/log.md

## Cross-Links

Use bundle-relative links (\`/wiki/decisions.md\`) when linking between wiki pages. They remain valid if a page is moved between directories.

## Context Budget

- Do not read all of .akrctx/ by default.
- Read policy.json first when safety or merge behavior matters.
- Read the current task capsule before implementation.
- Read only wiki pages that are relevant to the current task.
- Load target workflow skills or prompts only when the task calls for them.

## Protected Instruction Merges

- Protected instructions are read-only by default.
- The Doctor agent must show the exact minimal diff before asking for approval.
- Only explicit approval of that diff in the current conversation permits the agent to edit the protected file.
- A changed proposal or target requires a new preview and approval.
- After applying the approved diff, show the result, rerun Doctor, and remove the matching suggested file only when the merge is verified.
`,

  "wiki/log.md": `${wikiFrontmatter("akrctx-wiki-log", "Log", "Chronological history of akrctx events.", ["log"])}# Log

## ${new Date().toISOString().slice(0, 10)}
- akrctx initialized.
`,

  "wiki/gaps.md": `${wikiFrontmatter("akrctx-wiki-gaps", "Gaps", "Identified gaps in the akrctx harness.", ["gaps", "doctor"])}# Gaps

- No gaps detected.
`,

  "wiki/recommendations.md": `${wikiFrontmatter("akrctx-wiki-recommendations", "Recommendations", "Suggested next steps for the akrctx harness.", ["recommendations", "doctor"])}# Recommendations

- No actionable recommendations.
`,

  "wiki/index.md": `${wikiFrontmatter("akrctx-wiki-index", "Wiki Index", "Directory of akrctx wiki pages.", ["index", "akrctx"])}# Wiki Index

- [Overview](/wiki/overview.md) — Project overview and quick reference.
- [Architecture](/wiki/architecture.md) — Project architecture.
- [Conventions](/wiki/conventions.md) — Coding and review conventions.
- [Testing](/wiki/testing.md) — Build, test, lint, and validation commands.
- [Workflows](/wiki/workflows.md) — Supported workflows and selection policy.
- [Decisions](/wiki/decisions.md) — Project and agent-workflow decisions.
- [Agent Setup](/wiki/agent-setup.md) — Doctor readiness report.
- [Gaps](/wiki/gaps.md) — Identified harness gaps.
- [Recommendations](/wiki/recommendations.md) — Suggested next steps.
- [Write Policy](/wiki/write-policy.md) — Where to persist durable context.
- [Log](/wiki/log.md) — Chronological history.
`,
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
