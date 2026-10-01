# Acceptance Criteria

## Schema and compatibility

- AC-1: A config containing `agents` with entries for `judge`, `comprehension`, and
  `implementer` loads, and every field resolves to the configured value.
- AC-2: An `agents` entry with a name other than those three is rejected with a message naming
  the three valid entries.
- AC-3: Every field of an `agents` entry is optional: an entry of `{}` resolves to the same
  effective settings as an absent entry.
- AC-4: A config written before this task — `judge.enabled`, `comprehensionGate.*`, and no
  `agents` key — loads and produces identical effective behaviour to the current release:
  same agents enabled, same triggers, same files emitted.
- AC-5: `impl.enabled` maps onto `agents.implementer.enabled` by the same rule.
- AC-6: Loading a legacy config does not rewrite it. The bytes of `.akrctx/config.json` are
  unchanged after a read-only command runs against it.
- AC-7: `akrctx upgrade` does not migrate or delete legacy keys.
- AC-8: When `agents.judge.enabled` and `judge.enabled` disagree, the `agents` value takes
  effect and Doctor reports the divergence naming both paths and the value in effect. Same
  for `comprehension` against `comprehensionGate`, and for `implementer` against `impl`.
- AC-9: `akrctx judge enable` and `akrctx comprehension enable` write to `agents.<name>` and keep
  an existing legacy key in step with the canonical value.

  Amended during implementation. The original criterion said the legacy key was left
  byte-identical. That produces a permanent divergence on every install that runs `enable`:
  the canonical value says enabled and the legacy key it did not touch still says disabled,
  so Doctor would report a divergence caused by akrctx itself, and an older akrctx reading
  the same file would behave the opposite way. Mirroring keeps both readers in agreement and
  leaves divergence meaning what it should — somebody hand-edited two sources of truth.
  Nothing here deletes, renames, or migrates a legacy key.
- AC-10: `akrctx config set` accepts `agents.judge.enabled`, `agents.judge.trigger`,
  `agents.comprehension.enabled`, `agents.implementer.maxAttempts`, and the corresponding
  keys for the other agents, and still accepts every key it accepts today.

## Models

- AC-11: A model configured for a target is written into the generated file at that host's
  location: `model` frontmatter for Claude and Copilot, `model` key for Codex TOML.
- AC-12: `akrctx upgrade` regenerates the agent file from the config, so a configured model
  survives regeneration.
- AC-13: A target with no configured model produces a generated file with no model field, as
  today, and the host picks its own default.

  Amended during implementation. The plan also asked for byte-identical generated files
  when no model is configured, which contradicts replacing the hand-edit paragraph in the
  same task: the templated model section changes those bytes by design. The invariant that
  survives is the one that matters — no model configured means no model field emitted.
  Generated agent files are now recorded in the provenance manifest, so `upgrade` updates
  them in place instead of preserving them with a merge suggestion.
- AC-14: A model that does not match its target's pattern is still written literally to the
  generated file, and produces a warning naming the target, the configured value, and the
  expected shape.
- AC-15: The warning appears in the output of `judge enable` / `comprehension enable`, in
  `doctor`, and in `upgrade`. A test asserts each of the three surfaces.
- AC-16: Every generated agent file names the config path that controls its model. The current
  paragraph telling the reader to hand-edit the frontmatter is gone from all three
  templates.
- AC-17: A model matching its pattern produces no warning on any surface.

## Triggers

- AC-18: An unrecognised `trigger` is accepted, propagated into the generated instructions, and
  reported by `status`, with a warning naming the recognised values.
- AC-19: A recognised `trigger` produces no warning.
- AC-20: No command fails, and no record is rejected, because of a trigger value. A test asserts
  `judge verify` accepts a valid record regardless of the configured trigger.

## Targets

- AC-21: `agents.<name>.targets` restricts emission to the listed targets: files are written for
  those and for no other installed target.
- AC-22: An absent `targets` emits for every installed target that has a format for that agent.
- AC-23: A target listed under an agent but not present in `config.targets` is skipped with a
  warning, and does not fail the command.
- AC-24: `pi` under any agent's `targets` is skipped with a warning stating that no agent format
  exists for Pi, and Doctor states the same rather than reporting nothing.
- AC-25: No agent file is ever written for a target absent from `config.targets`.

## Attempt budget

- AC-26: `agents.implementer.maxAttempts` defaults to 3 when absent.
- AC-27: A non-integer, zero, or negative `maxAttempts` is rejected with an error that names the
  key and the valid domain. It never resolves to an unlimited budget.

## Doctor

- AC-28: Doctor's judge and comprehension gap checks read the resolved configuration rather than
  the raw legacy keys, and still fire for a legacy-only config with the feature enabled and
  files missing.
- AC-29: A fresh install with no agents enabled reports no agent-related gap or warning.

## Regression and hygiene

- AC-30: `capsuleFiles` is unchanged, and nothing in this task alters `taskDigest`, `judge scope`,
  or snapshot behaviour.
- AC-31: Existing agent instruction files are preserved: protected files are edited only after the
  exact diff is shown and approved in conversation.
- AC-32: Public documentation and the changelog describe the `agents` block, the per-target model
  field, the warning-not-error policy for models and triggers, and Pi as unsupported for
  agent emission. `.akrctx/wiki/decisions.md` records the Pi debt.
- AC-33: `pnpm build`, `pnpm test`, and `pnpm lint` pass.
