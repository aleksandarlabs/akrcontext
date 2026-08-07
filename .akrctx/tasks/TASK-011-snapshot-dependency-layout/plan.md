# Plan

## Workflow

TDD.

`workflowRules.bugfix` is `TDD`, and this is a bug with a reproduction already in hand. The
fix is also a security-adjacent one: it relaxes a blanket `dereference: true` that currently
guarantees isolation by brute force, so the tests that pin the isolation property have to be
written and seen to pass before and after, not inferred.

## Steps

1. Write a pnpm-shaped fixture test: a package reachable only through a symlink farm, whose
   validation command fails against `dereference: true` and passes once the layout survives.
2. Write the isolation tests: an escaping absolute link and an escaping relative link are
   both dereferenced, and a broken link is dropped.
3. Replace `copyLocalDependencies` with a walk that classifies each symlink by where its
   target resolves, and copies files and directories as before.
4. Import `symlink`, and cover the `overlayChangedFiles` symlink branch that currently
   throws `ReferenceError`.
5. Run `npx vitest run` and `npx tsc --noEmit`, then fill the review checklist.
