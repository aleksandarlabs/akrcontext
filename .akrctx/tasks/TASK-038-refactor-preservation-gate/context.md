# Context

## Relevant Files

- `evals/README.md` — the rules this task implements. It already states that a refactor's minimum
  evidence is "behaviour is preserved and configured budgets do not regress", and that refactor
  scenarios "may declare preservation or inconclusive evidence but cannot self-declare improvement
  without an independent grader". The Refactor row of its "Minimum evidence" table is what this
  task makes concrete.
- `evals/schema/scenario.schema.json` — already supports everything needed. `changeType` accepts
  `"refactor"`; `outcome.direction` accepts `"preserve"`; `outcome.verdict` accepts `"preserved"`;
  `comparison` takes `baseExpected` and `candidateExpected`. Nothing here changes.
- `evals/scenarios/smoke/` — the nine existing scenarios and the style to follow.
- `evals/lib/compare.mjs` — the comparison path `eval:compare` runs. Read to understand what a
  `preserved` verdict requires; do not modify.
- `evals/lib/safe-report.mjs` — redaction rules. Scenarios must not depend on anything it strips.
- `evals/fixtures/` — six fixtures exist, including `minimal-typescript`, `initialized-claude`,
  `existing-hooks` and `invalid-config`. Reuse before adding.
- `package.json` — `eval` and `eval:compare` scripts. Both take `--suite`.
- `.akrctx/tasks/TASK-026`, `027`, `029`, `033`, `034`, `035` — the six capsules whose
  `acceptance-criteria.md` this task edits.

## Prior Findings

- Measured on this commit: nine scenarios, all in the `smoke` suite. Change types are six
  `observability`, two `fix`, one `feature`. **Zero `refactor`.**
- Six of the nine scenarios are trace/hook scenarios. `init`, `doctor`, `judge`, `impl`,
  `templates` and `upgrade` have no eval coverage at all. That wider gap is TASK-039's, not this
  task's, but it explains why no refactor scenario could simply be adapted from an existing one:
  for most of the six surfaces, nothing comparable exists to copy.
- The preservation machinery is therefore unused rather than missing. This task adds scenarios and
  documentation; it adds no capability.
- The six refactor capsules currently specify manual before/after output captures. That check is
  real but fragile in one specific way: the "before" capture must be taken before the first edit,
  and once the edit is made it can no longer be taken. `eval:compare` reconstructs the base from a
  Git ref, so it does not have that failure mode.
- `judge --json` records are consumed by `akrctx judge verify` and by the calling agent, so their
  indentation and key order are part of a contract, not presentation. That is why byte-level
  pinning matters for that surface specifically and not for all of them.

## Blocked Reads

- Secrets and credentials must not be read: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`,
  `secrets/`, `credentials/`, `private/`.
- `evals/.cache/builds/` holds checked-out copies of older commits used by the build cache. Read
  them as evidence about past behaviour if useful; never edit them and never treat `src/*.ts` under
  those paths as current source.
