# Plan

## Workflow

SDD+TDD

## Steps

1. Specify the `agents` block: the three fixed entries, the field set per entry, the
   defaults, and the resolution rule that maps legacy `judge`, `comprehensionGate`, and
   `impl` onto it. Settle the precedence rule for a divergent config before writing code.
2. Write the compatibility tests first, and make them fail. A config shaped like the
   current release must produce identical effective behaviour, and reading it must not
   rewrite the file. This is the test that protects every existing installation, so it
   comes before the feature.
3. Write failing tests for resolution: `agents` wins over a divergent legacy key, Doctor
   reports the divergence, `enable` writes to `agents` and leaves legacy bytes untouched,
   and an unknown entry name is rejected.
4. Implement `AgentsConfig` in `src/types.ts` and the resolver in `src/config.ts` as a
   sibling of `normalizeComprehensionGate`, until steps 2 and 3 pass.
5. Write failing tests for per-target model rendering across the three host formats, then
   turn `judgeAgents` and `comprehensionAgents` from static constants into functions of the
   resolved agent config. Keep the no-model output byte-identical to today's, so an
   unconfigured project sees no diff.
6. Add pattern validation and the warning channel. Test each of the three surfaces —
   `enable`, `doctor`, `upgrade` — separately; a warning that exists only in one is the
   likely failure.
7. Implement per-agent `targets` selection in `desiredManagedFiles` and in the enable
   commands, with the skip-and-warn path for uninstalled targets and for Pi.
8. Add `maxAttempts` validation. It is the one error-not-warning case, and it needs its own
   test asserting an invalid value is rejected rather than resolved to unlimited.
9. Extend `validConfigKeys` and `setConfigValue` with the `agents.*` keys.
10. Update Doctor's gap checks to read the resolved config instead of raw legacy keys.
11. Replace the hand-edit-the-frontmatter paragraph in all three agent templates with the
    config path that controls the model.
12. Run `pnpm build`, `pnpm test`, `pnpm lint`. Record the results in the review checklist.
13. Update public documentation, the changelog, and record the Pi debt in
    `.akrctx/wiki/decisions.md`.

## Notes

Step 2 is the ordering constraint. Every other change is additive and visible; a
compatibility regression is silent, because a configuration that stops being honoured looks
exactly like one that was never set. That test has to exist and fail before the resolver
does.

Step 5 has a second constraint worth stating: the generated output for a project with no
model configured must be byte-identical to today's. Otherwise `akrctx upgrade` presents
every existing installation with a diff on files nobody asked to change, and the manifest
comparison that decides whether a managed file drifted stops meaning anything.

The implementer entry is schema-only here. Nothing in this task emits an implementer agent
or reads `maxAttempts` at runtime — TASK-008 does that, and is rewritten against this schema
once this task lands.
