# AGENTS.md - ContextForge Contributors

This repository builds ContextForge, a local CLI that installs agent workflow harnesses into other projects.

## Product Boundaries

- ContextForge is a harness installer, not a coding agent.
- Do not add LLM API calls, telemetry, web UI, SaaS behavior, or external agent execution.
- The CLI may create structure, templates, task capsules, config, policy files, and target-specific instructions.
- Existing instruction files in a target project must be preserved. Write suggested files on conflict.

## Engineering Rules

- Use TypeScript on Node >=20.
- Keep commands deterministic and testable.
- Keep root target instructions minimal; put heavier workflows in skills/prompts loaded on demand.
- Do not read or include secrets in generated task capsules or briefs.
- Prefer focused tests around safety behavior: detection, preserve-and-suggest writes, config defaults, task creation, and compile output.

## Quality Gates

Run before handoff:

```bash
pnpm build
pnpm test
pnpm contextforge init --target codex --dry-run
pnpm contextforge doctor --json
```

## Primary Source Files

- `src/cli.ts` - command wiring.
- `src/init.ts` - harness installation.
- `src/doctor.ts` - deterministic setup audit.
- `src/task.ts` - task capsule generation.
- `src/compile.ts` - target brief generation.
- `src/config.ts` - project defaults and workflow config.
- `src/templates.ts` - generated harness content.
- `tests/contextforge.test.ts` - CLI core behavior.
