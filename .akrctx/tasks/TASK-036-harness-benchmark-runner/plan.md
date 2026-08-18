# Plan

## Workflow

- research-first, then SDD+TDD

## Why

`workflowRules` maps `unknownArea` to research-first and `apiOrContract` to SDD+TDD. This task is
both, in that order.

Research comes first because three assumptions decide the design and none of them has been
tested. Whether `claude -p` can authenticate inside a container from an environment variable
decides whether the isolation choice survives. Whether its structured output carries turn and
token counts decides whether half the report exists. Whether a suitable external repository can
be pinned and its tests withheld decides whether the seed taskset is possible at all. Each is
answerable in under an hour by measuring. Writing the runner before measuring them means writing
it twice.

SDD applies because two contracts outlive the code: the bench task schema and the report schema.
A report written today has to stay readable when the taskset grows and the runner is rewritten,
so the shape is the deliverable and it is designed before it is implemented.

TDD applies to the parts where being wrong is silent. Condition isolation, environment
scrubbing, out-of-scope diffing and the withheld-test guarantee all fail quietly and produce a
plausible number instead of an error. Those get a failing test first.

`fast-patch` was rejected: this is new infrastructure that spends money and runs untrusted
repository code. `EDD` was rejected as the lead workflow, which is an odd thing to say about a
benchmark — but `evals/` measures akrctx and this measures agents, so the existing evaluation
machinery is a reference for style and safety, not a harness this task plugs into.

The honest limit of this plan: at N=5 the benchmark will almost certainly not separate the two
conditions. That is expected and it is not a failure of the task. The deliverable is a trustworthy
instrument and the first honest reading from it, not a result.

## Steps

### Research — before writing any runner code

1. Run `claude -p` inside a plain container with only a provider key in the environment. Record
   whether it authenticates, and record the exact invocation in `log.md`. If it needs a host
   credential file or an interactive login, stop and return the finding: the isolation decision
   has to be reopened before anything else.
2. Capture the headless structured output for one trivial task. Record which fields carry turn
   count, token counts and cost, and which are absent. Paste the real shape into `log.md`. Do not
   design the report against a remembered schema.
3. Choose the external repository for the seed taskset. Confirm: pinned SHA resolves, its history
   never mentions akrctx, its licence permits this use, its test suite is green at that SHA, and
   its suite runs in the container in a time the caps allow. Record all six checks.
4. Decide how the hidden test is withheld, and prove the chosen method: assert the agent's working
   tree at every point before it stops contains neither the test's assertions nor a filename that
   reveals the target.
5. Measure one real agent run end to end by hand, in one condition, and record its wall clock and
   its cost. Every cap and every budget number in the design comes from this measurement, not
   from a guess.

### Design the two contracts

6. Write the bench task schema, following the style of `evals/schema/scenario.schema.json`:
   `additionalProperties: false`, required fields explicit, ids constrained by pattern. Include
   the taskset version.
7. Write the report schema. Fix the separation of outcome metrics from cost metrics in the shape
   itself, so a later writer cannot merge them by accident. Include the reproducibility block:
   taskset version, akrctx SHA, model id, image digest, Node version, N, caps.
8. Answer the first Open Question in task.md now, in writing, and record the answer under
   `## Clarifications`: which side `turns` sits on. It is a schema decision, so it cannot wait for
   the implementation.

### Build the runner

9. Scaffold `bench/` with its own `package.json`, `"private": true`. Add the `.gitignore` entries.
   Verify `pnpm pack` at the root does not include it.
10. Implement `--list` and schema validation first. They need no container and no key, and they
    make everything after them debuggable.
11. Write the failing tests for the silent-failure paths, then implement each: condition isolation
    (baseline has no akrctx artifact), environment scrubbing, identical repository state across
    conditions, out-of-scope diffing against the pinned SHA, withheld-test reachability.
12. Implement the container lifecycle: build or pull by digest, one fresh container per run, caps
    enforced, `terminationReason` recorded on every exit path including crash and timeout.
13. Implement the pre-run green check. A repository not green at the pinned SHA marks the run
    unusable; it must never be counted as a regression caused by the agent.
14. Implement metric collection. Anything the agent's output does not supply is recorded as
    `unknown`. Add a test that plants missing fields and asserts no number is invented.
15. Implement `--dry-run` across the whole plan, with a test asserting no provider call happens.
16. Implement the report writer, including the interval on every proportion and the statement of
    N. Reuse the redaction approach in `evals/lib/safe-report.mjs` rather than reinventing it.
17. Implement the budget pre-check that prints worst-case spend before spending anything.

### Run it for real

18. Execute one full batch: 2 tasks, 2 conditions, N=5. That is 20 agent runs. Record the report
    and the actual cost verbatim in `log.md`.
19. Read the report as an outsider would. If any number in it can be misread as a verdict, fix the
    report, not the reader.

### Close out

20. Write `bench/README.md`. Correct the agent-benchmark paragraph in `evals/README.md`; do not
    only append to it.
21. `CHANGELOG.md`, additive only, continuations indented two spaces.
22. Run `pnpm lint && pnpm build && npx vitest run` and record the output verbatim.

## Risks

- **The benchmark will probably show nothing at N=5, and that will be read as "akrctx does not
  work".** It is the correct reading of five runs and the wrong reading of akrctx. The report has
  to say so itself, in its own text, because the person quoting it will not have read this plan.
- **The `akrctx` condition costs more turns by construction**, since the harness instructs the
  agent to write a capsule first. If cost and outcome are not visibly separated, the benchmark
  will make its own subject look bad for doing what it was built to do. This is the single most
  likely way for the instrument to be wrong.
- **The measurement can be self-flattering without anyone intending it.** Whoever writes the
  bench tasks knows what akrctx is good at. Tasks written to suit the harness produce a real
  number about a rigged question. The seed tasks should come from the external repository's own
  issue history where possible, not from imagination.
- **Untrusted repository code runs during the benchmark.** The container is the mitigation and it
  has to hold before the first external repository is added, not after. `evals/README.md` already
  states this rule for scenario refs; here it is not optional.
- **Cost runs away quietly.** Twenty runs is one batch. A tighter N, more tasks and a second model
  multiply fast. The budget pre-check exists so that the number is seen before it is spent, not
  reconstructed from an invoice.
- **Headless output shape is outside this project's control.** If it changes, the cost half of
  every historical report becomes incomparable. Recording the exact agent version in the report is
  what makes that detectable later.
- **A green suite at the pinned SHA is an assumption, not a fact.** Upstream repositories have
  flaky tests. If the pre-run check is flaky, `regressions` becomes noise and the most useful
  outcome metric is the least trustworthy one. Step 3 measures this; if the suite is not stable
  across repeated runs at the same SHA, pick a different repository.
