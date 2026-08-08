# Context

## Relevant Files

- `src/judge-enforcement.ts` — `runValidationCommand` (L437, the `execAsync` shell call), the
  `--run-tests` branch (L233–265) that sets `validationCwd = reviewCwd` for the non-snapshot path
  and only creates a worktree for the snapshot path, and `verifyJudgeRecord`'s options type.
- `src/cli/judge.ts` — the `verify` command options (`--run-tests`, `--json`) and its action
  (L224–265); where the repeatable `--approve-commands` is added and where TTY detection,
  printing and the y/N prompt live.
- `src/cli/shared.ts` — `normalizeOptions` already derives `nonInteractive` from
  `process.stdin.isTTY`; the precedent for keeping TTY concerns in the CLI layer.
- `src/judge-snapshot.ts` — `createJudgeSnapshotValidationWorkspace` (L269). Used unchanged; it
  copies an existing snapshot directory, which is why non-snapshot candidates are refused rather
  than given a worktree of their own.
- `tests/akrctx.test.ts` — the existing `--run-tests` suite (L2656–2720+) that the new tests extend.
- `CHANGELOG.md` — breaking-change entry.

## Decisions referenced

- 2026-08-08 audit item 5 verdict (NO PASA) and the follow-up design discussion: operator approval
  is the sole honest barrier without a SO sandbox; no allowlist/denylist.

## Blocked Reads

- Secrets and credentials must not be read.