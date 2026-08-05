# akrctx evaluations

This directory contains black-box evaluations for changes to the akrctx CLI.
Unit tests prove implementation behavior. Evaluations prove what changed relative
to a baseline and keep unproven value claims explicit.

## The loop

1. Classify the change: `fix`, `feature`, `observability`, `refactor`, or `docs`.
2. State the user problem, hypothesis, baseline, threshold, regression budget, and kill criterion.
3. Add or reuse a declarative scenario under `evals/scenarios/`.
4. During development, run the current candidate:

   ```bash
   corepack pnpm eval
   corepack pnpm eval -- --scenario <scenario-id>
   corepack pnpm eval -- --list
   ```

5. Before merge, compare committed refs:

   ```bash
   corepack pnpm eval:compare -- --base origin/main --candidate HEAD
   ```

Results are written to `evals/results/<run-id>/report.json` and `report.md`. Reports record the exact base and candidate SHAs, Node version through the build-cache key, and a semantic SHA-256 digest of the selected scenario set. Cached builds are installed under an atomic per-key lock and a cache hit revalidates the built CLI hash. Use `--keep-workdir` to retain disposable fixtures for debugging.

## Two verdicts, not one

Every scenario reports these separately:

- **Mechanism**: whether the change behaves as specified.
- **Outcome**: `improved`, `preserved`, `worsened`, `inconclusive`, or
  `not-applicable` relative to the baseline.

A new command existing on the candidate proves mechanism, not user value.
`inconclusive` is a valid result and must not be rewritten as improvement. A candidate-only mechanism remains inconclusive. Documentation scenarios must declare `not-applicable`; refactor and observability scenarios may declare preservation or inconclusive evidence but cannot self-declare improvement without an independent grader. The aggregate report uses `PARTIAL` only when demonstrated improvements coexist with inconclusive claims. Not-applicable scenarios are counted separately, produce `NOT_APPLICABLE` when they are the only outcomes, and do not dilute a demonstrated improvement.

## Minimum evidence

| Change type | Minimum evidence |
|---|---|
| Fix | The reproducer fails on base and passes on candidate. |
| Feature | Candidate adds the declared behavior and existing smoke scenarios remain green. The deterministic MVP keeps outcome inconclusive; an independent outcome grader is required to claim improvement. |
| Observability | Known ground truth is classified correctly and observation stays within its perturbation budget. |
| Refactor | Behavior is preserved and configured budgets do not regress. |
| Documentation | A deterministic or explicit manual check; no outcome claim. |

## Scenario safety

Scenarios execute the built CLI in disposable repositories. Commands are
executable-plus-argument arrays and never pass through a shell. Fixture, working-directory, and assertion paths are checked through real filesystem paths so symlinks cannot escape the disposable root. Child processes receive a minimal environment with an isolated `HOME`; ambient credentials are not forwarded. Each stream has a 1 MiB capture budget. Reports omit command arguments and raw stdout/stderr, retaining only executable names, byte counts, and SHA-256 digests. Local repository paths and execution errors are redacted or hashed.

Scenario files and compared Git refs are executable code: package lifecycle scripts and scenario commands can still access the evaluator machine and network. Evaluate only trusted refs on a local backend. Run pull requests or other untrusted refs inside an isolated container without host credentials.

## Scope

The first evaluator is deterministic and provider-free. Agent benchmarks are a
separate milestone after this runner is trusted. They must pin the repository,
model, harness, task, condition, and grading contract, and compare baseline and
akrctx conditions with independent outcome checks.
