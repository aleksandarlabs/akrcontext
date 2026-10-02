# Context

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands
work as direct commits on main. Shipped harness content lives in src/templates. Managed files
use CLI regeneration; existing capsule templates currently remain on the preserve path until
TASK-079 is implemented.

## Relevant Files

- `src/judge-enforcement.ts` — `createJudgeScope` holds the foreign-capsule rule, which throws
  and names every foreign task ID and path. `readValidationDeclaration` parses the `## Validation`
  fence, including the `# optional` suffix and the `no-runtime-validation:` form; it is the parser
  a `## Migration` section would copy. `verifyJudgeRecord` holds the `--run-tests` path,
  the operator approval call, and `snapshotValidationDrift`.
- `src/judge-snapshot.ts` — `createJudgeSnapshotValidationWorkspace` builds the disposable copy
  from the lockfile, and catch-up snapshots carry the parent's include decision.
- `src/validation-evidence.ts` — command sanitising and bounded redacted failure evidence.
- `src/task.ts` — `migrateAcceptanceCriteriaIdentifiers`, the worked example of a generator
  command, and the kind of command a `## Migration` section would declare.
- `.akrctx/judge/README.md` — the shipped contract, including the explicit statement that
  re-execution is process isolation and not an OS sandbox.
- `.akrctx/local/impl/TASK-075/log.md` — the recorded two-commit workaround and its reason.

## Prior deliveries

- TASK-067 made every required validation command verifiable by re-execution.
- TASK-072 proposes a deterministic runner with a bound receipt; it remains pending.
  The current verify path still executes commands when --run-tests is requested.
- TASK-075 produced the 73-capsule mechanical change that motivates this task.

## Blocked Reads

- Secrets and credentials must not be read.
