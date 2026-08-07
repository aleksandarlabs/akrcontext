# Task

## Goal

Two defects found in manual QA of the agents feature, one of which makes the headline
capability of TASK-009 — configuring an agent's model — not work through the path a user
actually takes.

1. **`enable` does not regenerate an agent file that already exists.** `judge enable`,
   `comprehension enable`, and `impl enable` pass the user's `--force` through to
   `writePlannedFile`, so without that flag an existing agent file is preserved. The normal
   sequence is to enable an agent, notice the model is missing, set it, and enable again —
   and that last step silently does nothing. `akrctx upgrade` and `enable --force` both
   apply the model correctly, so the setting works and only this path is broken.

   These files are akrctx-owned and generated from configuration. The generated file says so
   in its own `## Model` section: a model added by hand does not survive `akrctx upgrade`.
   Preserving one on `enable` treats a regenerable artifact as if it were a user edit.

2. **Every write prints as if it were a creation.** The CLI renders `+ <path>` for each
   entry in `writes` without reading its `kind`, so a `preserve` is indistinguishable from a
   `create`. During QA this reported

   ```
   + .github/agents/akrctx-implementer.agent.md
   ```

   for a file it had just decided not to touch. Defect 1 is confusing only because of this
   one: an honest line would have said the file was preserved and pointed at the fix.

   This is the more serious of the two. A tool that reports a write it did not perform
   cannot be trusted about the writes it did perform, and the same printer is used by
   `init`, `upgrade`, `judge`, `comprehension`, `impl`, and the template commands.

Two smaller gaps found alongside them:

3. `akrctx init` lists `comprehension enable` and `judge enable` under its next steps and
   never mentions `impl enable`, so the third agent is undiscoverable from the one screen
   every new user reads.
4. The CHANGELOG describes Doctor's agent gap check as reading resolved configuration, but
   not that its threshold tightened: it now reports a gap when *any* expected agent file is
   missing, where the judge check it replaced fired only when *every* one was.

## Validation

```
pnpm build && npx vitest run
```

## Out Of Scope

- `akrctx init` not adding a second target to `config.targets` on a repeated run. Found in
  the same QA pass and confirmed pre-existing — `src/init.ts` is untouched by this branch —
  so it is a separate capsule. It is why `judge enable` reports a target as not installed
  after `init --target <that target>` appeared to succeed.
- Changing which files are protected, or the protected-file merge flow. Agent files are
  managed, not protected, and this task does not move anything across that line.
- The remaining pre-existing `npx tsc --noEmit` errors in test files.

## Clarifications

### Session 2026-08-07

- `enable` regenerates an existing agent file rather than preserving it, without requiring
  `--force`. The file is generated from configuration, `akrctx upgrade` already rewrites it
  unconditionally, and the file's own text tells the reader a hand edit will not survive.
  Preserving it would keep the two commands disagreeing about who owns the file, and would
  keep the model setting broken on the path most users take.
- A regeneration that produces identical content reports as unchanged rather than as an
  update, so re-running `enable` with nothing to change does not claim to have written.

## Open Questions

- None recorded yet.
