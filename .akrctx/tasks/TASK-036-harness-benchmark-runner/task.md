# Task

## Goal

Build a benchmark that measures whether installing akrctx changes what a real coding agent
produces, using mechanical metrics only.

`evals/` answers "did this akrctx change break anything, and did it add the behaviour it claimed".
It cannot answer "is akrctx worth installing", because no agent ever runs inside it. That second
question is the one the project's value claim rests on, and today nothing in the repository
measures it.

This task builds the smallest thing that can answer it: a runner that takes a development task,
executes a real agent against a real repository twice — once without akrctx and once with it —
repeats that N times, and reports mechanical measurements per run. No LLM grader. No verdict.
Numbers and their spread.

## Why mechanical only

An LLM grader comparing two agent transcripts will find a difference, because it is asked to.
Before any grader is worth building, the cheap question has to be answered: does akrctx move
anything a machine can count — a hidden test passing, a protected file surviving, a green test
staying green? If it does not move those, a grader would only be producing agreeable prose about
a change that is not there. If it does move them, the grader has something real to explain, and
building it becomes a separate, better-specified task.

This is the same rule `evals/README.md` already states for the deterministic evaluator: a
candidate-only mechanism stays inconclusive, and improvement is not self-declared. This task
extends that rule to the harness itself.

## Shape of the measurement

One **bench task** is: an external repository pinned by commit SHA, a user-facing request in
plain language, and a hidden acceptance test the agent never sees.

Each bench task runs in two **conditions**, same repository, same model, same request:

- `baseline` — the repository as it is upstream.
- `akrctx` — the same repository with akrctx installed before the agent starts.

Each condition runs N times (default 5) because agent output varies run to run. A single run
proves nothing about either condition.

Every run is executed inside a disposable Docker container with no host credentials beyond the
provider key, driven by Claude Code in headless mode.

## What is measured per run

All of these are counted by a program, never judged:

- `hiddenTestPassed` — the task's hidden acceptance test, run after the agent stops.
- `regressions` — tests green before the run and failing after.
- `protectedFilesTouched` — writes to paths the task declares protected.
- `outOfScopeChanges` — files changed outside the task's declared scope globs.
- `turns`, `inputTokens`, `outputTokens`, `costUsd`, `wallClockMs`.
- `terminationReason` — completed, turn limit, budget limit, timeout, or crash.

## What this task deliberately does not do

It does not decide whether akrctx is good. It produces a report. The threshold and the kill
criterion belong to whoever reads it, declared before the run, exactly as `evals/README.md`
already requires.

## Validation

```
pnpm lint && pnpm build && npx vitest run
cd bench && node bench.mjs --list
cd bench && node bench.mjs run --taskset seed --dry-run
```

The runner's own unit tests run under the root suite. `--dry-run` must exercise the full plan —
container build, condition setup, metric collection wiring — without spending a token.

## Out Of Scope

- The LLM grader, in either form. Both the harness grader and the `evals/` feature grader are
  separate capsules that depend on this one producing numbers first.
- The full gold set. This task ships a seed taskset of two tasks in one external repository,
  enough to prove the runner works. Growing it to the 30-50 cases needed for statistical
  confidence is its own task, and its own artifact with its own version.
- Any change to `src/`. akrctx the CLI is the subject under measurement, not a participant.
- Any change to `evals/`. The deterministic evaluator stays exactly as it is, with its own
  dependencies and its own place in CI.
- Publishing results. What the numbers mean and who sees them is downstream of having them.
- A second agent backend. Claude Code headless is the harness where akrctx is actually used, so
  it is the condition worth measuring first. The runner should not make a second backend hard to
  add later, but adding one is not this task.
- Comparing akrctx against other harnesses.
- CI integration. This runner costs money and takes minutes per run. It is invoked deliberately.

## Clarifications

### Session 2026-08-18

- The first capsule covers **the mechanical runner only**. No LLM grader in any form. The reason
  is above under "Why mechanical only": a grader built before the mechanical numbers exist has
  nothing to be checked against.
- The bench lives in **`bench/` inside this repository, with its own `package.json`**. It stays
  out of `pnpm test`, out of the default CI, and out of the `files` array in the root
  `package.json`. Its dependencies must not reach the published CLI, which advertises two runtime
  dependencies. A separate repository was rejected for now: every iteration needs to install
  akrctx from the local tree, and a relative path is the cheap way to do that while the runner is
  still changing shape.
- The agent under test is driven by **Claude Code in headless mode**, not by a hand-written
  tool-use loop. A hand-written loop would measure the loop, not the harness. akrctx is used
  inside Claude Code, so that is the condition that corresponds to reality.
- Each run is isolated in a **Docker container with no host credentials** beyond the provider
  key. A real agent writes files and runs shell commands against repositories chosen for the
  benchmark, not by the operator; a local disposable directory would run all of that with the
  operator's own permissions.

## Open Questions

- **Does the `akrctx` condition spend more turns by design, and is that a cost or a failure?**
  akrctx's `CLAUDE.md` instructs the agent to create a task capsule and ask clarifying questions
  before implementing. In a headless run nobody answers, so the agent records the question and
  proceeds. That is correct behaviour and it costs turns and tokens. If `turns` is reported
  beside `hiddenTestPassed` without saying which is the outcome and which is the price, the first
  reader will read a working harness as a slower one. The report has to separate outcome metrics
  from cost metrics explicitly. Which side does `turns` sit on?
- **How does the `akrctx` condition get installed, and does that choice change what is
  measured?** Running `akrctx init` immediately before the agent starts measures a fresh install
  with generated instruction files and an empty `.akrctx/wiki/`. Committing akrctx into the test
  repository ahead of time measures a lived-in install with real wiki content and prior task
  capsules. Those are different products. The seed taskset should pin one and say so.
- **Can `claude -p` authenticate inside a container from an environment variable alone?** If
  headless mode needs an interactive login or a credential file from the host, the isolation
  decision above has to be revisited before any code is written. This is measurable in ten
  minutes and it gates the container design.
- **Is the headless JSON output stable enough to be the source of token and turn counts?** The
  whole cost side of the report reads from it. If the shape is not guaranteed, the runner needs
  a defensive parser that reports `unknown` rather than a plausible wrong number, and the report
  has to survive fields being absent.
- **Which external repositories, and can their tests be used this way?** They must be pinned by
  SHA, must not mention akrctx anywhere in their history, and their licences must permit what the
  benchmark does with them. This repository cannot be one of them: the model has read its
  CHANGELOG.
- **What stops a bench task from being solvable by reading the hidden test's name?** If the test
  file is present in the repository and only its assertions are withheld, a capable agent can
  infer the target from the filename. The taskset format needs to state where the hidden test
  lives and how it is withheld, or the measurement is of guessing, not of working.
- **Is N=5 reported as a result or as instrumentation?** Five runs per cell gives an interval so
  wide that almost no difference will clear it. That is the honest answer for a first version and
  it must be visible in the report, not discovered later by someone quoting "6/10 versus 8/10" as
  a finding.
