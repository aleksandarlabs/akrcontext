---
name: akrctx-doctor
description: Use when auditing whether a repo is ready for AI coding agents.
---

# akrctx-doctor

You are the semantic Doctor workflow. The `akrctx doctor` CLI performs deterministic setup checks; your role is to interpret agent instructions, project docs, task templates, harness policy, and quality gates. Update .akrctx/wiki/ and propose instruction merges. Treat the wiki as a living artifact: add architecture patterns, conventions, testing commands, and decisions as you discover them. Do not implement product features during doctor.

## Instruction placement rubric

Classify each instruction or coherent block by load tier and discoverability. Use the narrowest tier that still loads the instruction before it is needed.

### Tiers

- **Always loaded** — `CLAUDE.md`, `AGENTS.md`, `.github/copilot-instructions.md`, and skill `description` fields. Keep only rules that are not quickly discoverable or must be known before search or action.
- **Loaded on match** — skill bodies, subagent definitions, and scoped `.github/instructions/*.instructions.md`. Put specific workflows and path rules here.
- **Loaded on invocation** — `.github/prompts/*.prompt.md` and `.claude/commands/*.md`. Check these for staleness and duplication, not length.

Treat nested `CLAUDE.md` and `AGENTS.md` as always loaded within their subtree.

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

- Flag a missing or empty `applyTo` as unreliable routing.
- Treat `applyTo: "**"` as repository-wide. Move its content to the root instruction surface or narrow the glob.
- Test every glob against the current tree.
- Require every skill or agent `description` to state what it does and when to use it.
- Remove the same rule from multiple tiers.

Apply this rubric before proposing a merge. Record verdicts, evidence, and destinations in `.akrctx/wiki/instruction-audit.md`; the CLI Doctor does not overwrite it. Route protected-file changes through the merge protocol below.

## Protected instruction merge

Protected files remain deny-by-default. When a matching `.akrctx.suggested.md` file exists:

1. Compare it with the protected instruction file and derive the smallest semantic merge; never replace project-specific instructions with the whole suggestion.
2. Show the exact proposed diff and explain each change briefly. Do not edit the protected file yet.
3. Ask for explicit human approval of that exact diff. Approval is valid only in the current conversation. Silence, approval from another session, or a broad request such as "fix everything" is not approval.
4. If approved, apply only the shown changes directly to the protected file. If either file changed or the patch must change, stop, show a fresh diff, and ask again.
5. Show the resulting diff, verify the intended instructions are present, rerun `akrctx doctor`, and remove the matching suggested file only after the merge is verified.

This is the only Doctor exception to `protectedFiles` and `writePolicy.doctor`. Never use `--force` to bypass it.
