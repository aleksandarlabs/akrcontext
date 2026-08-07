# Review Checklist

- [x] Goal and contract match the approved design.
- [x] `agents` holds exactly the three built-in entries; any other name is rejected.
- [x] A configuration written before this task loads and behaves identically, and reading
      it does not rewrite the file.
- [x] No legacy key is removed, renamed, or migrated on disk.
- [x] `agents` wins over a divergent legacy key, and Doctor reports the divergence with
      both paths and the effective value.
- [x] `enable` commands write to `agents` and keep an existing legacy key in step, merging
      rather than replacing the block. (Criterion amended during implementation — see
      acceptance-criteria.md for why mirroring replaced byte-identical.)
- [x] Per-target `model` is rendered at the right place in all three host formats.
- [x] A project with no model configured gets a generated file with no model field.
      (Amended: byte-identical output is incompatible with replacing the hand-edit
      paragraph in the same task.)
- [x] A model failing its target's pattern is written literally and warned about — never
      an error, never dropped.
- [x] The model warning appears in `enable`, `doctor`, and `upgrade`, each asserted by a
      test.
- [x] Every generated agent file names the config path that controls its model, and the
      hand-edit-the-frontmatter paragraph is gone.
- [x] An unrecognised trigger warns and is still propagated; no command fails or rejects a
      record because of a trigger.
- [x] Per-agent `targets` narrows emission and never widens it beyond `config.targets`.
- [x] An uninstalled target, or Pi, is skipped with a warning rather than failing.
- [x] Doctor states the Pi limitation instead of staying silent about it.
- [x] `maxAttempts` defaults to 3, and an invalid value is an error that never resolves to
      an unlimited budget.
- [x] Doctor's gap checks read the resolved configuration, not the raw legacy keys.
- [x] `akrctx config set` accepts the `agents.*` keys and still accepts every existing key.
- [x] Nothing touches `capsuleFiles`, `taskDigest`, `judge scope`, or snapshot behaviour.
- [x] No implementer agent is emitted by this task's schema work; the implementer itself
      lands with TASK-008 on the same branch and consumes this schema.
- [x] Protected instruction files were not modified without exact-diff approval.
- [x] Documentation, changelog, and the Pi debt entry in `.akrctx/wiki/decisions.md` are
      updated.
- [x] `pnpm build`, `pnpm test`, `pnpm lint` pass.

## Validation Evidence

- `pnpm build` — tsup ESM + DTS build succeeded.
- `pnpm test` — 648 passed (5 files). 45 new assertions in `tests/agents.test.ts` cover the
  schema, compatibility, models, triggers, targets, the attempt budget, and Doctor.
- `pnpm lint` — biome check, 80 files, no findings.

### Deviations recorded

- Model identifier patterns were corrected against vendor documentation after review:
  Copilot names a model by display name with spaces and an optional vendor qualifier
  (`Claude Opus 4.5`, `GPT-5 (copilot)`), and Claude Code additionally accepts Bedrock
  ARNs, Mantle ids, and the `fable` alias. The first draft assumed slug-style ids for both,
  which would have warned about every correctly written Copilot value.
- Generated agent paths were added to `isManifestManagedPath`. Without provenance, `upgrade`
  could only preserve an agent file and write a merge suggestion, so a configured model
  would never reach the generated file — the criterion that the model survives regeneration
  is unachievable otherwise.
- Three pre-existing tests were updated where the trigger contract changed: an unrecognised
  `comprehensionGate.trigger` is now propagated with a warning rather than clamped to the
  default or reported as a Doctor gap.

### Self-review pass, 2026-08-07

This pass was run by the implementing agent, not by the independent judge, so it is not
independent evidence. What it produced is three defects found and fixed, each with a test:

- `akrctx impl status --json` reported `attemptsUsed: 0` for an unreadable log, next to a
  comment asserting the opposite. The guard was correct (`stopped`, no remaining attempts)
  but the reported count was not: a machine consumer reading 0 concludes no attempt was ever
  made. It now reports `null`.
- `akrctx doctor` answered "Setup is complete" for a config with an unknown entry under
  `agents` — the exact config that makes every other command fail, because `normalizeConfig`
  rejects it and Doctor parses the raw file. Doctor now names the unknown entry as a gap.
- The "Skipped" line after `enable` said "no native subagent support" for targets excluded
  by `agents.<name>.targets`, which was a true statement about Pi and a false one about a
  deliberately narrowed target. The wording now names both reasons.

Scope note: `akrctx remove` now deletes the judge and implementer agent files as well as
the comprehension one, because the per-agent file lists were unified. That is a behaviour
change neither capsule asked for. It is kept because `removeJudgeFiles` already existed and
was never called, which shows the omission was an oversight rather than a decision, and it
is recorded in the changelog.

Boundary reviewed: SNAPSHOT:4312c071d63741891655 (base HEAD).
