# CLAUDE.md - akrctx

This repository uses akrctx as a local agentic workflow harness. Treat .akrctx/ as the workflow source of truth.

## Mandatory Behavior

When the user asks to implement a feature, fix, refactor, or meaningful code change:

1. Read .akrctx/config.json and .akrctx/policy.json.
2. Create or update a task capsule under .akrctx/tasks/TASK-XXX-.../ before implementation.
3. Record the chosen workflow and the reason in the capsule.
4. Follow the workflow from config unless the user explicitly overrides it.
5. Load only relevant context. Do not read all of .akrctx/ by default.
6. After implementation, update the task review checklist and run relevant validation.
7. After implementation, follow the independent review and comprehension handoff below.

Create the task capsule yourself — do not ask the user to run `akrctx task`. The CLI task command is a headless fallback for scripts and CI. During normal agent use, YOU are responsible for creating and filling the task capsule with real context from the codebase.

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

- If judge.enabled is true, ask for confirmation before invoking akrctx-judge after implementation.
- Whenever a judge review comes back, save its exact JSON record under .akrctx/local/judge/ and run akrctx judge verify <record> --run-tests before acting on the verdict. This applies whether or not comprehension is enabled: an unverified verdict is a claim, not a result.
- Always use the --run-tests form. Without it, verification accepts the judge's claim that validation passed; with it, the CLI re-runs the capsule's declared commands and fails if any fails or if running them moved the boundary. You are the trusted caller and you can execute; the read-only judge and comprehension agents cannot, so this check belongs here and nowhere else. It runs the commands declared in the capsule's task.md, so confirm that file says what you expect before using the flag.
- If comprehensionGate.enabled is true, ask separately before invoking akrctx-comprehension, and hand off only when the verification above reports APPROVED and current.
- Give the comprehension agent only the task ID, exact base/candidate boundary, and verified judge-record path. Do not pass implementation explanations, suggested questions, expected answers, or the main conversation history as evidence.
- The comprehension agent owns the interactive teaching session and personal learning artifacts. The primary agent must not ask or grade comprehension questions itself.
- For a multi-turn checkpoint, have the developer select this agent directly or start `claude --agent akrctx-comprehension`; Claude subagents cannot ask UI questions.

## Safety

- Protected instructions are deny-by-default. Preserve them and use suggested files for conflicts.
- During Doctor only, you may edit a protected instruction file after you show the exact minimal diff and the human explicitly approves that exact change in the current conversation. Silence, old approvals, and general requests to "fix everything" are not approval. If the proposal or target changes, show the new diff and ask again.
- Do not read secrets or credentials (.env, *.pem, *.key, *.p12, *.pfx, secrets/, credentials/).
- Keep root instructions minimal. Load detailed workflows from target skills/prompts only when relevant.
