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

- None recorded yet.

## Open Questions

- Preferred direction: commit the dogfooded `.codex/agents/*.toml` (and any other
  config-required files) into git, or teach doctor to downgrade this specific case to
  info with a hint (`file listed in .gitignore; run akrctx judge enable after clone`)?
  The first keeps the audit strict and the repo self-exemplary; the second keeps
  machine-local files out of git but weakens the audit for exactly the files this repo's
  own AGENTS.md calls "never hand-edit".
