# Context

## Relevant Files To Inspect

- `src/task.ts` — `taskMarkdown()` generates the capsule written by `akrctx task`.
- `src/templates/wiki.ts` — `capsuleTemplates` is the shipped `.akrctx/tasks/_template`.
  It is typed `CapsuleContent`, so it and `task.ts` must stay in step.
- `src/templates/instructions.ts` — `taskBody` is the `akrctx-task` skill text;
  `skillFiles()` emits it to all four targets. `mainInstructionTemplate()` builds the
  root instruction file.
- `src/judge-enforcement.ts` — `readValidationDeclaration()` is the parser precedent
  (section regex + `sectionPresent` for legacy capsules); `verifyJudgeRecord()` and
  `JudgeVerifyResult` are where notices attach.
- `src/harness-files.ts` — `capsuleFiles` (unchanged here), `protectedFiles` (why
  `CLAUDE.md` needs explicit approval).
- `src/cli.ts:648` — `judge verify` action, human and `--json` output.
- `src/types.ts:1` — the four supported targets.
- `tests/akrctx.test.ts` — where template and parser tests live.
- `.akrctx/tasks/TASK-005-session-identity-and-trace/task.md` — house style reference.

## Notes

- `.akrctx/tasks/TASK-001…005` are real capsules on disk with `## Open Questions` and no
  `## Clarifications`. They are the backward-compatibility fixture.
- `evals/.cache/builds/` contains copies of old sources. Ignore it; it is build cache.

## Blocked Reads

- .env
- .env.*
- *.pem
- *.key
- *.p12
- *.pfx
- secrets/
- credentials/
- private/
