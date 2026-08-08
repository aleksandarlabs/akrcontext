import type { Target } from "../types.js";

export const targetReferenceTemplates: Record<Target, string> = {
  codex: "# Codex Target\n\nUse `AGENTS.md` and `.agents/skills/akrctx-*` as the primary akrctx harness.\n",
  claude:
    "# Claude Code Target\n\nUse `CLAUDE.md`, `.claude/skills/akrctx-*`, and `.claude/commands/` as the target adapter.\n\nFor the clarification step in `akrctx-task`, this host has a native question UI (`AskUserQuestion`); prefer it over enumerating options in prose. This is a rendering detail only — what gets written to the capsule is identical on every target.\n",
  copilot:
    "# GitHub Copilot Target\n\nUse `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/`, and `.github/skills/akrctx-*` as the target adapter. Skills are the reusable workflow surface; prompts are for one-shot invocation.\n",
  pi: "# Pi Code Target\n\nUse `.pi/prompts/` and `.pi/skills/akrctx-*` as the target adapter.\n",
};

export function mainInstructionTemplate(target: Target): string {
  const heading =
    target === "claude" ? "CLAUDE.md" : target === "copilot" ? "GitHub Copilot Instructions" : "AGENTS.md";
  const comprehensionInvocation =
    target === "claude"
      ? "For a multi-turn checkpoint, have the developer select this agent directly or start `claude --agent akrctx-comprehension`; Claude subagents cannot ask UI questions."
      : target === "copilot"
        ? "Use the agent picker or explicitly invoke the repository `akrctx Comprehension` custom agent for the interactive checkpoint."
        : target === "codex"
          ? "Spawn the project `akrctx-comprehension` agent, keep it in a separate thread, and direct the developer to continue the checkpoint in that thread."
          : "Pi has no native independent comprehension agent; do not run the checkpoint in the primary context.";
  return `# ${heading} - akrctx

This repository uses akrctx as a local agentic workflow harness. Treat .akrctx/ as the workflow source of truth.

## Mandatory Behavior

When the user asks to implement a feature, fix, refactor, or meaningful code change:

1. Read .akrctx/config.json and .akrctx/policy.json.
2. Create or update a task capsule under .akrctx/tasks/TASK-XXX-.../ before implementation.
3. Record the chosen workflow and the reason in the capsule.
4. Resolve ambiguity before implementing. See the clarification step below.
5. Follow the workflow from config unless the user explicitly overrides it.
6. Load only relevant context. Do not read all of .akrctx/ by default.
7. After implementation, update the task review checklist and run relevant validation.
8. After implementation, follow the independent review and comprehension handoff below.

Create the task capsule yourself — do not ask the user to run \`akrctx task\`. The CLI task command is a headless fallback for scripts and CI. During normal agent use, YOU are responsible for creating and filling the task capsule with real context from the codebase.

## Clarification

Ask the user before implementing when two plausible answers would produce different implementation, validation, or scope. If every plausible answer leads to the same code, it is not a question — do not ask it. There is no cap on the number of questions and no budget; the count follows from that test. There is no "assume and proceed" option, because the test already excludes trivia.

Record each answer under \`## Clarifications\` in the capsule's task.md, beneath a \`### Session YYYY-MM-DD\` heading, and propagate any answer that changes a criterion into acceptance-criteria.md. Ambiguity you did not resolve goes under \`## Open Questions\` as a question. Running headless with nobody to answer, recording it is the correct outcome; never close the gap by prediction.

In both sections one entry is one top-level \`- \` bullet, wrapped with indented continuation lines. \`akrctx judge verify\` reads only top-level bullets, so an entry written as a bare paragraph is invisible to it. The \`akrctx-task\` skill holds the full procedure.

## Workflow Selection

Read the live values from .akrctx/config.json:

- defaults.workflow
- defaults.requireTaskCapsule
- defaults.requireWorkflowReason
- defaults.contextBudget
- workflowRules
- comprehensionGate

If defaults.workflow is task-fit, choose the smallest workflow that fits the task. If it is concrete, use it unless the user explicitly asks otherwise.

## Write Policy

- Task capsules: .akrctx/tasks/TASK-XXX-.../
- Doctor findings: .akrctx/wiki/
- Compiled briefs: .akrctx/tasks/TASK-XXX-.../exports/
- Decisions: .akrctx/wiki/decisions.md
- Task implementation notes: .akrctx/tasks/TASK-XXX-.../log.md
- Personal comprehension records: .akrctx/local/comprehension/TASK-XXX/ (local only; never stage them)

## Independent Review and Comprehension

- If judge.enabled is true, ask for confirmation before invoking akrctx-judge after implementation. Once approved, capture an immutable local boundary with akrctx judge snapshot; snapshot capture never changes Git state or live files.
- Whenever a judge review comes back, save its exact JSON record under .akrctx/local/judge/ and run akrctx judge verify <record> --run-tests before acting on the verdict. Snapshot validation runs in a disposable copy outside the live project, so it cannot corrupt the immutable snapshot and newer live edits do not invalidate an approval for older reviewed content.
- Use akrctx judge current <record> to distinguish CURRENT, NEWER_CHANGES, and DIVERGED. For newer changes, create a catch-up snapshot from the verified record and review only that delta; never stretch an old approval over new code.
- Always use the --run-tests form. Without it, verification accepts the judge's claim that validation passed. You are the trusted caller and you can execute; the read-only judge and comprehension agents cannot, so this check belongs here and nowhere else. The flag requires a snapshot candidate and never runs anything unapproved: the CLI prints the declared commands and asks, or headless requires --approve-commands once per command in declared order. Read that list before approving — the disposable copy isolates ordinary relative writes but is not an OS sandbox for malicious commands.
- If comprehensionGate.enabled is true, ask separately before invoking akrctx-comprehension, and hand off only when the verification above reports APPROVED and current.
- Give the comprehension agent only the task ID, exact base/candidate boundary, and verified judge-record path. Do not pass implementation explanations, suggested questions, expected answers, or the main conversation history as evidence.
- The comprehension agent owns the interactive teaching session and personal learning artifacts. The primary agent must not ask or grade comprehension questions itself.
- ${comprehensionInvocation}

## Safety

- Protected instructions are deny-by-default. Preserve them and use suggested files for conflicts.
- During Doctor only, you may edit a protected instruction file after you show the exact minimal diff and the human explicitly approves that exact change in the current conversation. Silence, old approvals, and general requests to "fix everything" are not approval. If the proposal or target changes, show the new diff and ask again.
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
const doctorBody = `You are the semantic Doctor workflow. The \`akrctx doctor\` CLI performs deterministic setup checks; your role is to interpret agent instructions, project docs, task templates, harness policy, and quality gates. Update .akrctx/wiki/ and propose instruction merges. Treat the wiki as a living artifact: add architecture patterns, conventions, testing commands, and decisions as you discover them. Do not implement product features during doctor.

## Instruction placement rubric

Classify each instruction or coherent block by load tier and discoverability. Use the narrowest tier that still loads the instruction before it is needed.

### Tiers

- **Always loaded** — \`CLAUDE.md\`, \`AGENTS.md\`, \`.github/copilot-instructions.md\`, and skill \`description\` fields. Keep only rules that are not quickly discoverable or must be known before search or action.
- **Loaded on match** — skill bodies, subagent definitions, and scoped \`.github/instructions/*.instructions.md\`. Put specific workflows and path rules here.
- **Loaded on invocation** — \`.github/prompts/*.prompt.md\` and \`.claude/commands/*.md\`. Check these for staleness and duplication, not length.

Treat nested \`CLAUDE.md\` and \`AGENTS.md\` as always loaded within their subtree.

### Verdicts

Assign exactly one verdict:

- **keep** — useful, not quickly discoverable, and already at the right tier.
- **move** — useful but at the wrong tier. Prefer this verdict for misplaced content.
- **delete** — already stated by code, configuration, or standard tooling.
- **verify** — stale, unsupported, or maintainer-owned. Record the uncertainty; do not guess.

Move down by default. Move up only when evidence shows the instruction must govern every applicable task or be known before discovery, especially safety, approval, and global workflow rules.

### Always-loaded content

Keep global safety and approval rules, exact commands with required flags and working directory, limits, environment-variable effects, intentional constraints, non-obvious structure, behavior outside the repository, and the shortest commands that validate common changes.

Move or delete project summaries, tech-stack lists, obvious folder maps, endpoint schemas, generic advice, formatter or linter rules, and copied README content.

### Routing metadata

- Flag a missing or empty \`applyTo\` as unreliable routing.
- Treat \`applyTo: "**"\` as repository-wide. Move its content to the root instruction surface or narrow the glob.
- Test every glob against the current tree.
- Require every skill or agent \`description\` to state what it does and when to use it.
- Remove the same rule from multiple tiers.

Apply this rubric before proposing a merge. Record verdicts, evidence, and destinations in \`.akrctx/wiki/instruction-audit.md\`; the CLI Doctor does not overwrite it. Route protected-file changes through the merge protocol below.

## Protected instruction merge

Protected files remain deny-by-default. When a matching \`.akrctx.suggested.md\` file exists:

1. Compare it with the protected instruction file and derive the smallest semantic merge; never replace project-specific instructions with the whole suggestion.
2. Show the exact proposed diff and explain each change briefly. Do not edit the protected file yet.
3. Ask for explicit human approval of that exact diff. Approval is valid only in the current conversation. Silence, approval from another session, or a broad request such as "fix everything" is not approval.
4. If approved, apply only the shown changes directly to the protected file. If either file changed or the patch must change, stop, show a fresh diff, and ask again.
5. Show the resulting diff, verify the intended instructions are present, rerun \`akrctx doctor\`, and remove the matching suggested file only after the merge is verified.

This is the only Doctor exception to \`protectedFiles\` and \`writePolicy.doctor\`. Never use \`--force\` to bypass it.`;
const taskBody = `Turn the request into a task capsule with goal, scope, context, explicit workflow choice, acceptance criteria, validation commands, and an implementation brief.

## Clarify before implementing

Resolve ambiguity with the human before writing code, and leave the resolution in the capsule where the judge can read it.

**When a question exists.** Ask only when two plausible answers would produce different implementation, validation, or scope. If every plausible answer leads to the same code, it is not a question — do not ask it.

**How many.** There is no cap and no budget; the count falls out of the test above. A well-specified patch yields zero questions. An undefined contract yields as many as it takes. Never pad the list to look thorough, and never stop while a real ambiguity is left.

There is no "assume and proceed" option. The test above already excludes trivia, so assuming would only ever mean guessing about something that mattered.

**How to ask.** Plain text in a normal turn: one question, its alternatives enumerated, and what each would change. Ask one at a time so a later question can use an earlier answer. Decide matters of style yourself, and do not ask the human to design the implementation for you.

**Where the answer goes.** After each answer, before asking the next, append it under \`## Clarifications\` in task.md beneath a \`### Session YYYY-MM-DD\` heading carrying today's date. If the answer changes a criterion, propagate it into acceptance-criteria.md. The capsule is the artifact; the conversation is not.

**What stays open.** Ambiguity you did not resolve goes under \`## Open Questions\`, written as a question. Running headless with nobody to answer, that is the correct outcome: record it and treat the capsule as not ready. Never close the gap by prediction.

**Format, in both sections.** One entry is one top-level \`- \` bullet; wrap long entries with indented continuation lines. \`akrctx judge verify\` reads only top-level bullets, because both sections also carry explanatory prose that must not be mistaken for content. An entry written as a bare paragraph is invisible to it — the section reads as empty and no notice is emitted.`;
const reviewBody =
  "Check whether the task capsule is ready: goal clarity, testability, relevant context, blocked secrets, scope control, validation commands, and human-approved merge strategy.";
const workflowBody = `Use the workflow named in the task capsule.

## fast-patch

1. Load only the files directly touched by the change.
2. Make the smallest safe edit that satisfies the goal.
3. Verify the change does not break adjacent behavior.
4. No spec or new tests unless they already exist.

## research-first

1. Read .akrctx/config.json, policy.json, and relevant wiki pages without modifying code.
2. Inspect relevant files, git log, and .akrctx/wiki/decisions.md.
3. List open questions and areas of uncertainty in the task capsule.
4. Propose an approach and wait for user confirmation before implementing.
5. Switch to a concrete workflow (TDD, SDD, etc.) for implementation.

## SDD

1. Write or update the behavior contract: inputs, outputs, preconditions, postconditions, and explicit out-of-scope boundaries.
2. Record the contract in the task capsule before touching implementation files.
3. Implement only what the contract specifies.

## TDD

1. Write failing tests that encode the expected behavior. Confirm they fail for the right reason.
2. Implement the minimum code to make the tests pass.
3. Refactor if needed, keeping tests green.

## EDD

1. Define concrete examples and edge cases: happy paths, empty inputs, boundary values, unexpected combinations.
2. Record examples in the task capsule.
3. Implement against those examples.

## SDD+TDD

1. Write the behavior contract (SDD).
2. Encode the contract as failing tests (TDD).
3. Implement until tests pass.

## SDD+EDD

1. Write the behavior contract (SDD).
2. Define examples and edge cases that illustrate the contract (EDD).
3. Implement against contract and examples.

## TDD+EDD

1. Define examples and edge cases (EDD).
2. Encode each example as a failing test (TDD).
3. Implement until tests pass.

## UI review

1. Check for existing UI conventions in project instructions or .akrctx/wiki/conventions.md. If the project defines its own UI review process, follow it instead.
2. Discover which tools are present: stylelint, eslint with style or a11y rules, storybook, playwright, cypress, chromatic, percy, or any browser preview command in package.json scripts.
3. Run the tools that are available. Do not skip tools without noting why.
4. Report findings ordered by severity. Reference file and line where possible.
5. Do not modify code unless the user explicitly asks for fixes after the review.

Do not expand into a heavyweight process unless the task capsule or user explicitly asks for it.

## Judge (optional)

If \`judge.enabled\` is \`true\` in \`.akrctx/config.json\`, after completing implementation offer the user the option to invoke the \`akrctx-judge\` subagent for independent review. The judge reads the task capsule and changed code and reports APPROVED / NEEDS CHANGES / BLOCKED. Do not invoke it automatically; wait for explicit confirmation.

After the user approves review, capture the live boundary with \`akrctx judge snapshot TASK-XXX --base <ref>\` and pass its \`SNAPSHOT:<id>\` candidate to the judge. Capture writes ignored local artifacts only: it never commits, stages, stashes, checks out, creates a branch or ref, or changes live files. Its reviewable worktree omits policy-blocked paths and copies local Node dependencies when present instead of linking back to the live project. The user and other agents can keep working while the immutable snapshot is reviewed.

When a review comes back, save the judge's exact JSON record under \`.akrctx/local/judge/\` and run \`akrctx judge verify <review.json> --run-tests\` before acting on the verdict. Snapshot verification re-runs declared commands in a disposable copy outside the live project, including the snapshot's private local Node dependencies when present; it never mutates the immutable source snapshot. This protects ordinary relative writes, not malicious commands with absolute paths. The flag only accepts a snapshot candidate, and it never executes without approval: the CLI shows the declared commands and asks, or headless requires \`--approve-commands\` once per command in declared order. Do this whenever the judge runs, not only when comprehension is enabled — an unverified verdict is an unchecked claim, and without \`--run-tests\` the CLI takes the judge's word that validation passed. Read the list before approving it on work you did not supervise.

New live edits do not invalidate a snapshot approval. Use \`akrctx judge current <review.json>\` to validate the approved record and distinguish \`CURRENT\`, \`NEWER_CHANGES\`, and \`DIVERGED\`. For newer changes, capture \`akrctx judge snapshot TASK-XXX --from-review <review.json>\`; catch-up re-runs the parent's declared passing validation and preserves its intact ancestry. Ask the judge to review only that delta; never extend the old approval silently. Use \`akrctx judge prune --keep <n>\` to preview local retention and add \`--force\` only after reviewing the count.

If \`comprehensionGate.enabled\` is also true, offer the independent \`akrctx-comprehension\` agent only when that verification says the approval is current. If the judge is disabled, disclose that no independent correctness review exists before offering comprehension. Pass only the task ID, exact base/candidate boundary, and verified judge-record path to the comprehension agent. Never pass your implementation narrative, explanations, suggested questions, or expected answers. The comprehension agent owns all teaching, questions, answers, and learning artifacts in its separate context.`;
const writePolicyBody =
  "Write durable context only to the paths in .akrctx/wiki/write-policy.md. Keep the wiki alive: update architecture.md, conventions.md, testing.md, and decisions.md as the project evolves. Protected instructions remain read-only except for the narrow Doctor merge defined by policy.protectedFileMerge: show the exact diff, receive explicit approval in the current conversation, then apply only that diff. Do not read all of .akrctx/ by default. Prefer the active task capsule, policy.json, and only relevant wiki pages.";

const sharedSkills = {
  "akrctx-init": ["Use when installing or reviewing the akrctx harness in a repository.", initBody],
  "akrctx-doctor": ["Use when auditing whether a repo is ready for AI coding agents.", doctorBody],
  "akrctx-task": ["Use when turning a development request into a akrctx task capsule.", taskBody],
  "akrctx-review": [
    "Use before or after implementation to verify task readiness, quality gates, tests, and scope.",
    reviewBody,
  ],
  "akrctx-workflow": [
    "Use when selecting or applying SDD, TDD, EDD, research-first, fast-patch, UI review, or combined workflows.",
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
    "# akrctx Doctor\n\nUse the `akrctx-doctor` skill. Preserve protected instructions by default. Edit one only after showing the exact diff and receiving explicit human approval in the current conversation.\n",
  ".claude/commands/akrctx-task.md":
    "# akrctx Task\n\nUse the `akrctx-task` skill. Create or refine a akrctx task capsule before implementation.\n",
};

export const copilotFiles: Record<string, string> = {
  ".github/instructions/akrctx.instructions.md": `---
applyTo: ".akrctx/**"
---

# akrctx Instructions

When editing the akrctx harness, preserve existing instruction files and avoid secrets. Treat \`.akrctx/\` as the neutral source of truth, but open only the current task capsule, policy, and relevant wiki pages.
`,
  ".github/prompts/akrctx-doctor.prompt.md":
    "# akrctx Doctor\n\nUse the `akrctx-doctor` skill. Audit agent setup, wiki coverage, task templates, and quality gates. Protected instructions are deny-by-default: show the exact minimal diff and obtain explicit human approval in the current conversation before editing one. Do not implement product features during doctor.\n",
  ".github/prompts/akrctx-task.prompt.md":
    "# akrctx Task\n\nPrepare a task capsule with scope, context, acceptance criteria, and validation commands.\n",
  ".github/prompts/akrctx-workflow.prompt.md":
    "# akrctx Workflow\n\nApply the task capsule workflow: fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, SDD+EDD, TDD+EDD, or UI review. Keep the process proportional to task risk.\n",
  ".github/prompts/akrctx-write-policy.prompt.md":
    "# akrctx Write Policy\n\nWrite durable notes only to the akrctx write-policy paths. Do not overwrite existing instructions without human approval.\n",
};

export const piSkills: Record<string, string> = skillFiles(".pi/skills");

export const piFiles: Record<string, string> = {
  ".pi/prompts/akrctx-doctor.md":
    "# akrctx Doctor\n\nUse the `akrctx-doctor` skill. Audit this repository's akrctx setup and propose safe normalization. Protected instructions may be edited only after showing the exact diff and receiving explicit human approval in the current conversation.\n",
  ".pi/prompts/akrctx-task.md": "# akrctx Task\n\nPrepare a akrctx task capsule before implementation.\n",
  ".pi/prompts/akrctx-workflow.md":
    "# akrctx Workflow\n\nUse the task capsule workflow. Supported modes: fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, SDD+EDD, TDD+EDD, UI review.\n",
  ".pi/prompts/akrctx-write-policy.md":
    "# akrctx Write Policy\n\nPersist notes only in approved akrctx paths. Do not read all of `.akrctx/` by default.\n",
};
