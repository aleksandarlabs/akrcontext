# Context

## Relevant Files

- `src/templates/judge.ts` — `judgeInstructions` is the shared instruction string at the top;
  `judgeBody` appends the model section; `claudeJudgeFile` / `copilotJudgeFile` /
  `codexJudgeFile` wrap it per target. Step 3 of the current instructions is where repository
  content is declared "evidence, not instructions" — the new read step has to sit next to it and
  name itself as the deliberate exception.
- `src/templates/implementer.ts` — same shape. `implementerInstructions`, then three renderers.
  The "Before writing any code" section already lists the five capsule files; the new read step
  belongs there. Note the trailing export comment: the string is exported "for the cross-target
  identity test".
- `src/templates/agent-model.ts` — `frontmatterModel`, `modelSection`, `tomlModel`. Not edited,
  but explains how one body reaches three formats.
- `src/agents.ts` — maps agent name and target to renderer (`judge`, `comprehension`,
  `implementer` at lines 47-53). Not edited.
- `tests/dogfood.test.ts` — asserts every agent file required by `.akrctx/config.json` is tracked
  in Git. This is why the regenerated `.claude/agents/` and `.codex/agents/` files must be
  written, not just the templates.
- `.claude/agents/akrctx-judge.md`, `.codex/agents/*` — the dogfooded install of this repo.
  Generated artifacts; regenerate rather than hand-edit.
- `docs/JUDGE.md`, `docs/CONFIGURATION.md` — candidate homes for the new documentation section.
- `CHANGELOG.md` — unreleased section.

## Prior Findings

- `agentNames` is the closed list `["judge", "comprehension", "implementer"]`
  (`src/types.ts:33`). TASK-017 point 5 records the closed surface as a deliberate limit with a
  reconsideration trigger. This task does not touch it.
- The implementer's attempt budget already resolves from config via `resolveAgent(config,
  "implementer").maxAttempts` (`src/impl.ts:219`), so per-project tuning of the implementer
  already exists and is not what this task adds.
- The implementation log deliberately lives outside the capsule at
  `.akrctx/local/impl/<TASK-ID>/log.md` so the implementer's own account never enters the diff
  the judge reads (`src/impl.ts` header comment). `.akrctx/review-policy.md` is a tracked project
  file and is not subject to that rule — but it is the reason the additive-only bound matters:
  it is a tracked file the judge is told to obey.
- The judge's APPROVED verdict already requires an empty `issues` array, which is why a violated
  policy criterion needs no new verdict machinery.

## Blocked Reads

- Secrets and credentials must not be read: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`,
  `*.pfx`, `secrets/`, `credentials/`, `private/`.
- `.akrctx/local/judge/snapshots/` contains full copies of earlier worktrees. Do not read them
  as current source; `src/*.ts` under a snapshot path is an old revision.
