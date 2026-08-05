# AGENTS.md

This repository is the source for **akrctx** — a CLI that installs agentic workflow harnesses into other projects. You are working on the tool itself, not on a project that uses it. The `.akrctx/`, `.claude/`, and `AGENTS.md` files at the root are a dogfooded install of the tool's own output; shipped content lives in `src/templates/`.

Module map, layering, and the known doctor sharp edge: `.akrctx/wiki/architecture.md`.

## Key constraints

- `Workflow` in `types.ts` is the set of user-selectable workflows. `TaskWorkflow` extends it with `"UI review"`, which is auto-assigned via `workflowRules.ui` but not a user-selectable default.
- `src/templates/instructions.ts` is generated content — it is what agents in other projects will read. Keep it concise and instructional.
- `src/version.ts` is the single source of `CLI_VERSION`. Update it here when bumping the version; `cli.ts`, `templates/defaults.ts`, and `doctor.ts` all import from it.
- `src/harness-files.ts` is the single source of which files each target requires. A new generated file that is not listed there is invisible to `doctor`, `upgrade`, and `remove`.
- `policy.json` must not restrict what the programming agent can do (no `allowSourceCodeWrites`, no `network`, no `llmProvider` keys).
- Never hand-edit installed harness copies under `.claude/`, `.agents/`, `.github/skills/`, or `.pi/`. Edit `src/templates/*` and re-run the CLI; `.akrctx/manifest.json` tracks a sha256 per file.

## Mandatory behavior

For features, fixes, refactors, or other meaningful code changes:

1. Read `.akrctx/config.json` and `.akrctx/policy.json`.
2. Create or update a task capsule before implementation.
3. Record the selected workflow and its reason in the capsule.
4. Resolve material ambiguity before implementation.
5. Follow the configured workflow unless the user explicitly overrides it.
6. Load only relevant context.
7. Update the capsule review checklist and run relevant validation.
8. Follow the independent-review process below.

Create the capsule yourself; `akrctx task` is only a headless fallback.

## Clarification

Ask before implementing when plausible answers would change implementation, validation, or scope. Record answers in the capsule’s `## Clarifications`; record unresolved ambiguity as an `## Open Questions` entry. Use the `akrctx-task` skill for the full procedure.

## Workflow selection

Read the live workflow settings from `.akrctx/config.json`. When the default is `task-fit`, select the smallest suitable workflow; otherwise use the configured workflow unless the user overrides it.

## Independent review and comprehension

- If `judge.enabled` is true, ask before invoking `akrctx-judge`.
- Save each judge JSON record under `.akrctx/local/judge/` and run `akrctx judge verify <record> --run-tests` before acting on it.
- If the comprehension gate is enabled, ask separately before invoking it, and only after a current verified `APPROVED` result.

## Safety

- Protected instructions are deny-by-default; during Doctor, edit one only after showing its exact diff and receiving current-conversation approval.
- Do not read secrets or credentials (`.env`, keys, certificates, `secrets/`, or `credentials/`).
- For durable artifact locations, use `.akrctx/wiki/write-policy.md`.

## Before handoff

```bash
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```
