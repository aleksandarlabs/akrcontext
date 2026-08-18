# Context

## Relevant Files

Nothing under `src/` is modified by this task. The files below are read as reference or as the
boundary the new code must not cross.

- `evals/README.md` — states the two-verdict rule this task inherits: mechanism and outcome are
  reported separately, `inconclusive` is a valid result, and a change cannot self-declare
  improvement without an independent grader. Its closing "Scope" paragraph already says agent
  benchmarks are a later milestone requiring a pinned repository, model, harness, task, condition
  and grading contract. That paragraph is the specification this task implements, and it needs
  correcting once the benchmark exists.
- `evals/schema/scenario.schema.json` — the style the bench task schema follows:
  `additionalProperties: false`, explicit required list, ids constrained by pattern.
- `evals/lib/process.mjs` — `evaluationEnvironment` builds a child environment from an allow-list
  of inherited keys rather than filtering a deny-list. The bench needs the same discipline for the
  container environment. Also holds the 1 MiB per-stream capture budget and the process-tree kill,
  both of which apply to a runaway agent as much as to a runaway CLI step.
- `evals/lib/safe-report.mjs` — the existing redaction rules: reports keep executable names, byte
  counts and digests, and drop command arguments, raw output and local paths. Bench reports reuse
  this approach rather than inventing a second one.
- `evals/lib/git.mjs` — `isWorktreeDirty`, needed for the rule that a report must be tied to a
  commit when akrctx is installed from the local tree.
- `evals/lib/run.mjs` — the existing scenario lifecycle: materialise a disposable fixture, run
  steps, evaluate assertions, always clean up in `finally`. The bench lifecycle is the same shape
  with a container and an agent in the middle.
- `package.json` — the root manifest advertises two runtime dependencies (`@inquirer/select`,
  `commander`) and a `files` array of `dist`, `README.md`, `docs`, `templates`. The bench must not
  appear in either.
- `.gitignore` — already ignores `evals/results/` and `evals/.cache/` under "Local evaluation
  artifacts". Bench artifacts belong in the same section.
## Origin

This capsule comes from a design note written before the backlog review, which proposed an
agent-as-judge benchmark in three phases: a deterministic runner, an LLM grader, then cross-model
agreement. The note is not kept in the repository; what it proposed is recorded here.

This task is phase one, and only phase one. The two grader phases are deliberately excluded,
because a grader built before the mechanical numbers exist has nothing to be checked against. The
argument is in task.md under "Why mechanical only".

## Prior Findings

- The repository's own evaluator is deterministic and provider-free by design, and says so. This
  task does not change that; it adds a second, separate instrument beside it. Keeping the two
  apart is the reason for `bench/` having its own manifest.
- The existing `evals/` runner already solves several problems this task would otherwise solve
  badly: environment allow-listing, stream capture budgets, process-tree termination, path
  resolution that symlinks cannot escape, and report redaction. Read those before writing new
  versions of them.
- `evals/README.md` already warns that scenario files and compared Git refs are executable code
  and that untrusted refs need an isolated container without host credentials. The benchmark runs
  external repositories by definition, so that warning is not advisory here — it is the design.
- This repository cannot be a subject of the benchmark. akrctx appears throughout its history and
  its `CHANGELOG.md`, so a model has read about the harness it is being tested with.
- The `akrctx` condition is not a neutral variant of the `baseline` condition. Installing akrctx
  installs instruction files that change agent behaviour on purpose, including creating a task
  capsule and recording unanswered clarifications before implementing. Any metric that counts
  effort will move; that is the harness working, not the harness failing.

## Assumptions To Verify Before Implementing

These are recorded here because the plan's first phase exists to settle them. None is established.

- `claude -p` authenticates inside a container from an environment variable alone.
- Headless structured output carries turn count, token counts and cost in a shape stable enough
  to parse.
- An external repository exists that is pinned, akrctx-free in its history, licence-compatible,
  green at the pinned SHA across repeated runs, and fast enough to fit the caps.
- A hidden acceptance test can be withheld from the agent's working tree without withholding the
  context the task needs to be solvable.

## Blocked Reads

- Secrets and credentials must not be read: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`,
  `secrets/`, `credentials/`, `private/`.
- The model provider key is passed into the container by the runner from the operator's
  environment. It is never read into a file, never written to a report, and never recorded in a
  transcript retained under `bench/results/`.
- `.akrctx/local/` holds judge snapshots, which are full copies of earlier worktrees. Read them as
  evidence about structure only; `src/*.ts` under a snapshot path is an old revision.
