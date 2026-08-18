# Review Checklist

## Research came first

- [ ] `log.md` records whether `claude -p` authenticates inside a container from an environment
      variable alone, with the exact invocation used.
- [ ] `log.md` contains the real headless output shape, pasted, not described from memory.
- [ ] The seed repository passes all six checks from plan.md step 3, each recorded: SHA resolves,
      no akrctx in history, licence permits this use, suite green at the SHA, green across
      repeated runs, fits the caps.
- [ ] `log.md` records one hand-measured agent run with its wall clock and its real cost. Every
      cap in the design traces back to that number.

## The bench cannot leak into the published package

- [ ] `bench/package.json` exists and is `"private": true`.
- [ ] No bench dependency appears in the root `package.json`.
- [ ] `pnpm pack` output was inspected and contains no `bench/` entry. Inspected, not inferred
      from the `files` array.
- [ ] `pnpm test` at the root starts no container, invokes no agent, and makes no provider call.
- [ ] `.gitignore` covers `bench/results/` and the bench cache.
- [ ] `git diff --stat` confirms no file under `src/` or `evals/` changed, other than the
      `evals/README.md` correction.

## The two conditions differ in exactly one thing

- [ ] A test asserts the `baseline` container has no `.akrctx/`, no akrctx-authored `CLAUDE.md` or
      `AGENTS.md`, and no akrctx on `PATH`.
- [ ] A test asserts the `akrctx` container has the harness installed with its instruction files.
- [ ] A test pins that both conditions receive byte-identical request text and the same model id.
- [ ] A digest comparison proves repository content is identical across conditions before the
      agent starts.
- [ ] How akrctx is installed in its condition is decided in writing and recorded under
      `## Clarifications`, not left implicit in the code.

## Isolation and bounds hold

- [ ] Each run gets a fresh container. Grep for reuse rather than trusting the description.
- [ ] A test asserts the container environment contains no operator variable beyond the provider
      key, in the spirit of `evaluationEnvironment`.
- [ ] Turn cap, wall-clock timeout and spend cap are all enforced, and each has a test.
- [ ] `terminationReason` is set on every exit path, crash and timeout included.
- [ ] A crashed run is recorded, not dropped, and does not abort the remaining runs. Test present.
- [ ] The batch prints worst-case spend before spending anything, and refuses to exceed the
      declared budget.

## No metric is invented

- [ ] No provider call exists anywhere in the runner outside the agent invocation. Verified by
      grep over `bench/`, not by reading the diff summary.
- [ ] `hiddenTestPassed` is measured in a state the agent could not alter afterwards.
- [ ] A repository not green before the run is marked unusable, never counted as a regression.
      Test present.
- [ ] `outOfScopeChanges` and `protectedFilesTouched` derive from a diff against the pinned SHA,
      not from anything the agent said about itself.
- [ ] A test plants missing fields in the agent output and asserts the runner records `unknown`
      rather than a default or an estimate.
- [ ] The withheld test is genuinely unreachable from the agent's working tree at every point
      before the agent stops. Test present, and it fails if the content becomes reachable.

## The report cannot be misread

- [ ] Outcome metrics and cost metrics sit in separate sections with a stated difference in
      meaning.
- [ ] Which side `turns` sits on is decided, recorded, and reflected in the schema.
- [ ] Every proportion carries an interval. A bare fraction appears nowhere.
- [ ] Overlapping intervals are labelled as not separated by this run.
- [ ] The report states N and says a first run at this N is instrumentation, not evidence.
- [ ] There is no verdict field, no `improved`, and no overall pass or fail for akrctx.
- [ ] The reproducibility block is complete: taskset version, akrctx version and SHA, model id,
      image digest, Node version, N, caps in force.
- [ ] The committed report contains no local path and no credential. Redaction follows
      `evals/lib/safe-report.mjs`.
- [ ] Someone other than the implementer read the report cold and did not read any number in it
      as a verdict. If they did, the report changed — not the reader.

## It was actually run

- [ ] One full batch executed: 2 tasks, 2 conditions, N=5.
- [ ] The report and the real cost are recorded verbatim in `log.md`.
- [ ] `node bench.mjs --list` works with no Docker and no key.
- [ ] `node bench.mjs run --taskset seed --dry-run` exercises the full plan and spends nothing.
      Test asserts no provider call.
- [ ] Failure messages were triggered on purpose and read back: missing Docker, unresolvable SHA,
      absent key, schema-invalid task, budget exceeded.

## Documentation is not overclaiming

- [ ] `bench/README.md` states what is measured, what is not, the cost per run, and the Docker and
      key requirements.
- [ ] It states that the benchmark produces no verdict, and that threshold and kill criterion are
      declared before a run.
- [ ] The agent-benchmark paragraph in `evals/README.md` was **corrected**, not merely appended
      to. Any wording this task makes stale is gone.
- [ ] No documentation anywhere claims the benchmark shows akrctx improves anything. At N=5 it
      cannot, and the first version must not imply otherwise.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
