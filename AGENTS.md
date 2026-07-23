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

## Before handoff

```bash
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```
