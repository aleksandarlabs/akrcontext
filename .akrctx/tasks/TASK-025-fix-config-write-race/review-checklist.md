# Review Checklist

## Research came first

- [ ] The dependency decision is recorded under `## Clarifications` with its reasoning.
- [ ] `log.md` records how often the lost update actually reproduces, with the numbers.
- [ ] `log.md` records the measured write cost, or the "<10ms" criterion was deleted rather than
      left unmeasured.
- [ ] Windows rename-over-existing behaviour is verified or explicitly delegated to CI.

## Corruption is impossible

- [ ] `writeConfig` writes to a temporary file and renames. No bare `writeFile` on the target
      remains.
- [ ] The temporary file is in the same directory as the target.
- [ ] A forced failure between write and rename leaves the old file intact and no temporary
      behind. Test present.
- [ ] Two concurrent writers cannot collide on the temporary name. Test present.
- [ ] `--dry-run` writes nothing, including no temporary file. Test present.
- [ ] Other read-modify-write writers in this module are either covered or explicitly excluded in
      task.md with a reason.

## Updates are not lost

- [ ] Two concurrent writers on different keys both survive. Test present, and it forces the
      interleaving rather than relying on timing.
- [ ] Two concurrent writers on the same key yield one of the two values, never a partial object.
- [ ] The `agents.` path through `writeAgentKey` is covered. Grep for the early return and confirm
      it does not bypass the mechanism — this is the box most likely to be ticked without checking.
- [ ] A stale lock from a dead process is recovered. Test present.
- [ ] The wait is bounded and produces a named error. The CLI never hangs.
- [ ] If locking was not implemented, the documentation states plainly that a lost update is still
      possible. No text claims a guarantee that was not delivered.

## Nothing else moved

- [ ] Valid config key set, parsing and error messages unchanged.
- [ ] File format unchanged: two-space JSON with a trailing newline.
- [ ] `readConfig` behaviour on a missing or invalid file unchanged.
- [ ] `tests/dogfood.test.ts` passes.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] The two-terminal reproducer from task.md was run, and the resulting `config.json` is valid
      JSON with both changes. Output in `log.md`.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces.
