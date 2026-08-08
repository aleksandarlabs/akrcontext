# Acceptance Criteria

## Behavior contract — approval gate (SDD)

- **Precondition.** `verifyJudgeRecord` is called with `options.runTests === true` and the
  resolved command set `declaredAndPassing` (deduped, parse-order) is non-empty. If it is empty,
  the existing "no capsule-declared command claimed as passing" reason applies and no gate fires.
- **Injected decision.** `verifyJudgeRecord` performs no TTY detection and no terminal I/O. Its
  options gain `approve?: (commands: string[]) => Promise<boolean>`, called once with
  `declaredAndPassing`:
  - callback absent, or resolves `false` → `reexecuted` is empty, `approved === false`, a reason
    lists the withheld commands, exit code non-zero. No command runs.
  - resolves `true` → execution proceeds in the snapshot's disposable copy as today.
- **CLI — TTY path.** `src/cli/judge.ts` builds the callback. When `process.stdin.isTTY === true`
  and `--approve-commands` is unset, the callback prints the exact command list (one numbered line
  per command, verbatim trimmed string) and blocks on a y/N prompt; a non-affirmative response
  resolves `false`.
- **CLI — headless path.** When `process.stdin.isTTY !== true`:
  - `--approve-commands` unset → the callback resolves `false`; the CLI reports the expected
    commands and the exact copy-pasteable invocation that would approve them.
  - `--approve-commands` given → it is a repeatable option collected into `string[]` in
    occurrence order, each entry trimmed. It must equal `declaredAndPassing` element-for-element
    in order. Any length or string mismatch → resolves `false`, and the reported reason names the
    first divergence.
  - Match → resolves `true`.
  - The prompt is never synthesized in headless mode.
- **`--run-tests` unset.** `--approve-commands` is ignored; behavior is unchanged from today
  (validation taken on trust; `declaredCommands` reported in the JSON/text output).
- **Postcondition.** When approval is given and commands run, `reexecuted` and the drift reasons
  are computed exactly as today.

## Behavior contract — `--run-tests` requires a snapshot candidate

- `--run-tests` on a record whose `scope.candidate` is not `SNAPSHOT:<id>` (i.e. `WORKTREE` or a
  bare commit ref) → no command runs, `approved === false`, a reason instructs the operator to
  capture a snapshot first, exit code non-zero. The check precedes the approval callback.
- The non-snapshot branch that set `validationCwd = reviewCwd` is removed; there is no remaining
  path on which `--run-tests` executes in the live repository tree.
- The snapshot path keeps `createJudgeSnapshotValidationWorkspace` and its `finally` cleanup
  unchanged. Drift detection stays `snapshotValidationDrift` against the disposable copy.
- Verification **without** `--run-tests` is unaffected on non-snapshot records: they still verify
  the boundary and take validation on trust, exactly as today.

## CLI surface

- `akrctx judge verify <review-file>` gains `--approve-commands <cmd>`, repeatable (one occurrence
  per command, declared order). It is not comma-separated: declared commands may contain commas.
- `--run-tests` help text is updated to state the snapshot requirement, the headless
  `--approve-commands` requirement and the TTY prompt.
- `verifyJudgeRecord`'s options type gains `approve?: (commands: string[]) => Promise<boolean>`.
  It does **not** gain a raw `approveCommands` string; flag parsing stays in the CLI.

## Tests (TDD)

Unit level — `verifyJudgeRecord`, driven by a fake `approve` callback (no `process.stdin`
patching, no TTY hook):

- `approve` resolves true → commands run, `reexecuted` populated, exit as before.
- `approve` resolves false → no command runs, `approved === false`, reason lists withheld
  commands.
- `approve` absent while `runTests` is set → same refusal as a false resolution.
- `approve` is called exactly once, with `declaredAndPassing` in parse order.
- `--run-tests` on a `WORKTREE` candidate → refusal before `approve` is called (assert the
  callback was never invoked), reason tells the operator to snapshot first.
- `--run-tests` on a bare-commit-ref candidate → same refusal.
- Verify without `runTests` on a `WORKTREE` candidate → unchanged behavior, no refusal.

CLI level — `cli/judge.ts` callback construction:

- Headless without `--approve-commands` → refusal; output contains the expected commands and the
  copy-pasteable invocation.
- Headless with repeated `--approve-commands` matching exactly, including a command containing a
  comma → commands run.
- Headless with the flags reordered → refusal naming the first divergence, no run.
- Headless with one command missing → refusal, no run.
- `--run-tests` unset + `--approve-commands` set → ignored, output unchanged.

Regression — the existing `--run-tests` suite is **not** unaffected. Its five cases were built on
`createReviewFixture`, which produces a `WORKTREE` candidate, so the snapshot requirement refuses
all of them:

- Four are converted to a snapshot fixture with an approving callback: false passing claim, real
  passing claim, boundary intact for a non-mutating command, and the command named only by the
  record.
- `--run-tests rejects a command that passes but moves the boundary it approved` is **retired**.
  It asserts the live-tree drift message (`Validation changed the repository: …`), which is no
  longer reachable now that re-execution is snapshot-only. The snapshot equivalent already exists
  later in the suite (`invalidates a snapshot approval when snapshot content is tampered with`).
- Existing snapshot-path run-tests tests keep passing, with an approving callback supplied.

## Cross-cutting

- `pnpm build && npx vitest run` passes in full.
- `npx tsc --noEmit` adds no new error.
- `pnpm lint` clean.
- No installed harness copy hand-edited; generated files regenerate from `src/templates/*`.
- `akrctx doctor` still passes; `akrctx judge verify --run-tests` with an affirmative gate still
  APPROVES a valid snapshot record.
- `CHANGELOG.md` records both breaking behaviors (headless approval requirement; `--run-tests`
  refused on non-snapshot records) under Unreleased/Breaking.