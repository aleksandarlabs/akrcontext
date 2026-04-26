# AGENTS.md

This repository is the source for **akrctx** — a CLI that installs agentic workflow harnesses into other projects. You are working on the tool itself, not on a project that uses it.

## Architecture

The CLI is a Node.js ESM package (TypeScript, built with tsup, tested with vitest, linted with biome).

| File | Role |
|---|---|
| `src/cli.ts` | Command wiring (Commander.js). All user-facing help text lives here. |
| `src/init.ts` | Harness installation: detects targets, writes files, handles conflicts. |
| `src/doctor.ts` | Deterministic audit: checks installed files, scores readiness, writes wiki. |
| `src/task.ts` | Task capsule generation and workflow recommendation from description keywords. |
| `src/compile.ts` | Compiles a task capsule into a single agent-ready brief. |
| `src/config.ts` | Reads and mutates `.akrctx/config.json` in the target project. |
| `src/status.ts` | Quick install summary. |
| `src/remove.ts` | Removes harness files for a target. |
| `src/detect.ts` | Detects which agent targets exist in a project (Codex, Claude, Copilot, Pi). |
| `src/version.ts` | Single source of truth for the CLI version (`CLI_VERSION`). |
| `src/types.ts` | All types: `Workflow`, `Target`, `TaskWorkflow`, `akrctxConfig`, etc. |
| `src/fs-utils.ts` | File system helpers (pathExists, safeWrite, etc.). |
| `src/format.ts` | Terminal output formatting (colors, bold, rule lines). |
| `src/templates/instructions.ts` | **Single source of truth** for all generated harness content: skill text, instruction files, prompts. Change workflow or skill descriptions here. |
| `src/templates/defaults.ts` | Default `config.json` and `policy.json` content. |
| `src/templates/wiki.ts` | Wiki file templates installed under `.akrctx/wiki/`. |
| `tests/akrctx.test.ts` | Full CLI test suite — runs against a temp directory per test. |

## Key constraints

- `Workflow` in `types.ts` is the set of user-selectable workflows. `TaskWorkflow` extends it with `"UI review"`, which is auto-assigned via `workflowRules.ui` but not a user-selectable default.
- `src/templates/instructions.ts` is generated content — it is what agents in other projects will read. Keep it concise and instructional.
- `src/version.ts` is the single source of `CLI_VERSION`. Update it here when bumping the version; `cli.ts`, `templates/defaults.ts`, and `doctor.ts` all import from it.
- `policy.json` must not restrict what the programming agent can do (no `allowSourceCodeWrites`, no `network`, no `llmProvider` keys).

## Before handoff

```bash
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```
