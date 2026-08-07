# Task

## Goal

A fresh clone of this repository fails its own doctor audit. `.codex/` is listed in
`.gitignore`, so agent files that `judge.enabled: true` requires — e.g.
`.codex/agents/akrctx-judge.toml` — exist only on machines where the harness was
originally installed. Anyone cloning the repo gets:

```
akrctx doctor --json
→ [error] `agents.judge.enabled` is true but an agent file is missing.
          Run `akrctx judge enable`.
```

The source repository of a readiness-auditing tool should not report a readiness error
on a clean checkout. Either the dogfooded files the config requires become part of the
checkout, or doctor must treat "config requires a file this checkout intentionally does
not carry" as a documented, non-error state.

## Validation

```
git archive HEAD | tar -x -C /tmp/fresh-clone && cd /tmp/fresh-clone && pnpm install --frozen-lockfile && pnpm build && node dist/index.js doctor --json
```

The doctor run against a pristine checkout must produce no `error`-severity suggestion.

## Out Of Scope

- Changing what `akrctx init` or `akrctx judge enable` write into consumer projects.
- Reconsidering the gitignore policy for consumer projects; this task only concerns this
  repository's own dogfooded install.
- The wiki timestamp churn tracked in TASK-015.

## Clarifications

### 2026-08-07

- Direction chosen: Option A — commit the dogfooded agent files into git. Reason: this
  repository is the canonical example of the tool; if its own dogfooded install is not
  reproducible from a clean git checkout, `doctor` loses credibility. Option B would
  weaken the audit exactly for the generated files AGENTS.md marks as "never hand-edit"
  and would add gitignore-detection complexity to hide a state that is genuinely an error.
- Scope of committed files: only the agent files required by `.akrctx/config.json` will be
  tracked. The stale `.codex/agents/akrctx-comprehension.toml` is not required (the
  comprehension agent is disabled in config) and will be removed so the tracked set
  matches the live configuration.
- Manifest ownership: committed `.toml` files remain under the provenance manifest.
  `akrctx upgrade` regenerates them from the templates and their sha256 hashes distinguish
  tool-written content from hand edits. A new test guarantees that every config-required
  agent file is tracked by git.

## Open Questions

- None.
