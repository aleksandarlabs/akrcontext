# Acceptance Criteria

## The refactor suite exists and covers the six surfaces

- AC-1: A `refactor` suite exists under `evals/scenarios/`, selectable with `pnpm eval -- --suite refactor`.
- AC-2: Every scenario declares `changeType: "refactor"`, `outcome.direction: "preserve"` and
  `comparison.baseExpected: "pass"` / `candidateExpected: "pass"`.
- AC-3: The six surfaces are covered, each by at least one scenario:
  - doctor gap messages, including the `.akrctx/policy.json` and `.akrctx/config.json` text that
    TASK-026 must not change;
  - the hook trace report, including the uncertainty flag TASK-027 must preserve;
  - judge snapshot exclusion and hook blocked-path flagging, for TASK-029;
  - the content `init` and `upgrade` generate, including the project name, for TASK-033;
  - `init`, `doctor`, `doctor --json`, `doctor --ci` and `templates apply` output, for TASK-034;
  - all eight `judge` subcommands in both human and `--json` form, for TASK-035, covering the
    failure paths of `verify` and `current`, not only the success paths.
- AC-4: Each scenario names in its `hypothesis` which capsule it protects, so a later reader can tell why
  it exists.

## The scenarios are honest

- AC-5: Running `pnpm eval:compare` against an unchanged tree reports every new scenario as `preserved`.
  A scenario that cannot report `preserved` when nothing changed is broken and is fixed, not
  tolerated.
- AC-6: Each scenario is proven to actually catch a change: introduce a deliberate one-character output
  change, confirm the scenario fails, revert it. The transcript goes in `log.md`. A preservation
  scenario that passes no matter what is worse than none, because it is trusted.
- AC-7: `--json` output is pinned as bytes wherever the schema allows. If the schema cannot express a
  byte comparison, that limit is recorded in `log.md` rather than worked around silently.
- AC-8: No scenario depends on a timestamp, a path from the host, a hash of build output, or anything
  else that differs between two runs of the same tree. Each scenario is run twice on the same ref
  and must agree with itself.

## The gate is documented and citable

- AC-9: `evals/README.md` documents the preservation gate: the exact command, when to run it, and what
  `preserved` versus `inconclusive` means for a refactor. Its existing "Minimum evidence" table row
  for Refactor is corrected to name the command rather than describing the requirement abstractly.
- AC-10: The command is stable enough to be quoted in a capsule without a paragraph of explanation.

## The six capsules are updated

- AC-11: `acceptance-criteria.md` in TASK-026, 027, 029, 033, 034 and 035 cites the gate.
- AC-12: The manual capture procedures in those files are **removed**, not left alongside. Specifically:
  the before/after output captures in TASK-034 and TASK-035, and the byte-diff instructions in
  TASK-035.
- AC-13: Where a manual step survives, the capsule says why the gate does not cover it. TASK-027's
  characterization tests are an example: they pin internal branches the CLI never prints, so the
  gate cannot replace them.
- AC-14: No capsule ends up with both an automated gate and a manual equivalent for the same property.

## Nothing else moved

- AC-15: No change to `evals/lib/`, `evals/schema/`, `evals/cli.mjs` or the fixture machinery.
- AC-16: No change to `src/`. If a scenario reveals a bug, it is reported as a finding and gets its own
  capsule; it is not fixed here.
- AC-17: The existing `smoke` suite is unchanged and still passes. `pnpm eval` with no suite argument
  behaves as before.
- AC-18: `tests/evals.test.ts` passes, and any addition to it is additive.

## Validation

- AC-19: `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- AC-20: `pnpm lint` reports zero errors and zero warnings.
- AC-21: `pnpm eval -- --suite refactor` passes.
- AC-22: `pnpm eval:compare -- --base origin/main --candidate HEAD --suite refactor` reports every
  scenario as `preserved`, and the report is recorded in `log.md`.
- AC-23: `CHANGELOG.md` records the new suite under the unreleased section, additive only, continuations
  indented two spaces.
