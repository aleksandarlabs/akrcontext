# Acceptance Criteria

## The bench is isolated from the published package

- `bench/` has its own `package.json` with `"private": true`. Its dependencies appear nowhere in
  the root `package.json`.
- The root `package.json` `files` array does not include `bench`. Verify by inspecting the
  contents of `pnpm pack`, not by reading the array.
- `pnpm test` at the repository root does not execute any agent, start any container, or make any
  network call to a model provider. The bench's own unit tests are pure and may run there; the
  bench run itself must not.
- `.gitignore` excludes `bench/results/` and any bench cache directory, matching how
  `evals/results/` and `evals/.cache/` are already handled.
- No file under `src/` or `evals/` changes.

## A bench task is a declared artifact, not code

- A bench task is a data file validated against a schema. The schema is committed and the runner
  refuses a task that does not validate, naming the failing field.
- A bench task declares at least: repository URL, commit SHA, the user request text, the hidden
  acceptance test command, the scope globs, the protected paths, and the pre-run test command
  used to establish the green baseline.
- The taskset carries its own version identifier. Every report records it. Changing a task
  requires changing that version, so old reports stay interpretable.
- A seed taskset of two tasks against one external repository is committed and runs end to end.
- The hidden acceptance test is genuinely withheld: a test asserting so must fail if the test
  content is reachable from the agent's working tree at any point before the agent stops.

## The two conditions differ in exactly one thing

- A test proves the `baseline` container has no akrctx artifact: no `.akrctx/`, no akrctx-authored
  `CLAUDE.md` or `AGENTS.md`, no akrctx binary on `PATH`.
- A test proves the `akrctx` container has the harness installed and its instruction files
  present.
- Both conditions receive byte-identical request text and the same model identifier. A test pins
  this rather than leaving it to the caller.
- The repository content at the pinned SHA is identical in both conditions before the agent
  starts. A digest comparison proves it.

## Every run is isolated and bounded

- Each run executes in a fresh container. No run reuses another run's filesystem.
- The container receives no host credential other than the model provider key. A test asserts the
  environment passed in contains no other variable from the operator's environment, in the same
  spirit as `evaluationEnvironment` in `evals/lib/process.mjs`.
- Every run carries a turn cap, a wall-clock timeout, and a spend cap. Reaching any of them ends
  the run and is recorded in `terminationReason`, never silently retried.
- The runner refuses to start a batch whose worst-case total spend exceeds a declared budget, and
  prints that worst case before spending anything.
- A crashed or timed-out run produces a recorded row with its reason. It is never dropped, and it
  never aborts the remaining runs.

## Metrics are counted, never judged

- Every metric in task.md "What is measured per run" is produced by a program from filesystem
  state, exit codes, or the agent's structured output.
- `hiddenTestPassed` comes from running the declared command after the agent stops, in a state
  the agent could not have altered afterwards.
- `regressions` requires the pre-run test command to have passed before the agent started. If it
  did not, the run is recorded as unusable rather than counted as a regression.
- `outOfScopeChanges` and `protectedFilesTouched` are derived from a diff against the pinned SHA,
  not from anything the agent reported about itself.
- Token, turn, and cost figures that the agent's output does not supply are recorded as `unknown`.
  The runner never estimates them and never substitutes a default.
- No metric anywhere in the runner is produced by a language model. Grep the source to confirm
  there is no provider call outside the agent invocation itself.

## The report separates outcome from cost, and states its own uncertainty

- The report is written as JSON and as Markdown, following the existing `evals/results/` shape.
- The report records, for reproducibility: taskset version, akrctx version and commit SHA, model
  identifier, container image digest, Node version, N, and the caps in force.
- Outcome metrics and cost metrics are presented in separate sections with a stated difference in
  meaning. A reader must not be able to mistake "used more turns" for "did worse".
- Every proportion is reported with an interval, not as a bare fraction. A difference whose
  intervals overlap is labelled as not separated by this run.
- The report states N and says plainly that a first run at this N is instrumentation, not
  evidence of a difference.
- The report contains no verdict field, no `improved`, and no pass or fail for akrctx as a whole.
- Raw agent transcripts are retained under `bench/results/` for inspection, and the committed
  report does not embed repository paths or credentials, matching the redaction rules already
  applied in `evals/lib/safe-report.mjs`.

## The runner is usable and honest before it is fast

- `node bench.mjs --list` prints the tasks in a taskset without touching Docker or the network.
- `node bench.mjs run --taskset seed --dry-run` exercises the whole plan — image resolution,
  condition setup, metric wiring, report writing — and spends nothing. A test asserts no provider
  call is made.
- The runner refuses to run against a dirty local worktree when it installs akrctx from the local
  tree, so a report can always be tied to a commit.
- Failure messages name the reason: missing Docker, unresolvable SHA, absent provider key,
  schema-invalid task, budget exceeded.

## Documentation

- `bench/README.md` states what the benchmark measures, what it does not measure, the cost of one
  run, and the fact that it needs Docker and a provider key.
- It states plainly that the benchmark produces no verdict, and that a threshold and a kill
  criterion must be declared before a run, matching the rule in `evals/README.md`.
- `evals/README.md` gains a pointer distinguishing the two: deterministic evaluator versus agent
  benchmark. Its existing text about agent benchmarks being a later milestone is corrected, not
  merely appended to.
- `CHANGELOG.md` records the addition under the unreleased section, as new entries only,
  continuations indented two spaces.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- One real end-to-end batch has been executed at least once, and its report is recorded in
  `log.md` with the numbers, including the cost.
