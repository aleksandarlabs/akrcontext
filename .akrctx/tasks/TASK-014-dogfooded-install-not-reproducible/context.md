# Context

## Relevant Files

- `.gitignore` — line 31 ignores `.codex/`.
- `.akrctx/config.json` — `judge.enabled: true`, `targets: ["claude", "codex"]`.
- `.codex/agents/akrctx-judge.toml` — present on the original machine, absent in fresh
  clones; `src/templates/judge.ts` owns its content (`codexJudgeFile`).
- `src/agents.ts` — `agentFilePathList("judge", targets)` derives the paths doctor checks.
- `src/doctor.ts` — emits the error-severity suggestion when an enabled agent file is
  missing.
- `src/judge.ts` — `runJudgeEnable` regenerates the missing files.

## Prior Findings

- Reproduced via a full copy of the working tree *with* `.codex/` present: doctor reports
  info-only ("Setup is complete", 100/100).
- The same checkout without `.codex/` (state of any fresh clone) reports the error above.
- `.claude/agents/akrctx-judge.md` **is** tracked; only the codex-side files are ignored,
  so the error mentions whichever target's files are missing.

## Blocked Reads

- Secrets and credentials must not be read.
