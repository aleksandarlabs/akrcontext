# Plan

## Workflow

TDD.

`workflowRules.bugfix` is `TDD`, and both defects have an exact reproduction from manual QA.
The first one is a coverage failure as much as a code failure: the existing suite tested
that `upgrade` regenerates a configured model but never that `enable` does, which is why a
shipped feature did not work on the path a user takes. Writing that test first is the point.

## Steps

1. Write the failing test for the QA sequence: enable, set the model, enable again, assert
   the file carries it. Add the idempotence assertion for a second enable with no change.
2. Write the failing test for write reporting: a preserved file does not carry the creation
   marker.
3. Make `writePlannedFile` report an unchanged forced write as `preserve` with a reason that
   says so, rather than as an `update`.
4. Have the three enable commands regenerate their agent files.
5. Print writes by `kind` in the CLI, leaving `--json` untouched.
6. Add `akrctx impl enable` to the init next-steps text, and the doctor threshold line to
   the CHANGELOG.
7. Run `pnpm build && npx vitest run` and `npx tsc --noEmit`, then fill the checklist.
