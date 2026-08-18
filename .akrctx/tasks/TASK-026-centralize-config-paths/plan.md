# Plan

## Workflow

- research-first, then fast-patch

## Why

`workflowRules` maps `unknownArea` to research-first and `smallSafePatch` to fast-patch. The
change itself is mechanical; what precedes it is not.

Research comes first because the substitution is not safe until every occurrence is classified.
`grep '"\.akrctx/' src` returns around thirty hits and most of them in `doctor.ts` are **inside
user-facing gap message strings**, not path construction. Replacing those with a constant either
changes the text a user reads or produces a template concatenation that is harder to read than
the literal it replaced. The research step is that classification, and it takes an hour.

fast-patch then applies to the substitution, because the existing suite already covers it. Every
consumer reads a file that exists in the fixtures, so a wrong constant fails a test rather than
passing silently. `tests/dogfood.test.ts` checks this repository's own install, which is the
strongest coverage the change could ask for.

`TDD` was rejected: there is no new behaviour to drive out. A refactor whose correctness is proven
by the unchanged suite does not need a new failing test first.

`SDD` was rejected: no contract between programs changes. The directory layout is the same
afterwards.

## Steps

1. Enumerate every `.akrctx/` literal in `src/` and classify each one as **path construction** or
   **message text**. Put the table in `log.md`. Nothing is edited until the table exists.
2. Capture the doctor gap messages before any change, so they can be compared afterwards. The
   snapshot tests may not cover the gap text; if they do not, add a test that does, in this step.
3. Decide where the constants live and whether `manifestPath` (`src/manifest.ts:7`) joins them.
   Two homes for the same kind of constant is the problem this task exists to remove. Record the
   decision in task.md.
4. Check for an import cycle before writing the imports. If `config.ts` is imported by modules it
   would then import, the constants go in a leaf module instead. Do not resolve a cycle with a
   dynamic import; `judge-snapshot.ts:754` already does that and one instance is enough.
5. Export the constants. Replace only the path-construction occurrences.
6. Record the position of this task relative to TASK-029, TASK-033, TASK-034 and TASK-035 in
   task.md. All five touch the same files.
7. Re-run the message comparison from step 2. The gap text must be byte-identical.
8. `pnpm lint && pnpm build && npx vitest run`, plus starting the built CLI. Output recorded.
9. `CHANGELOG.md`, additive only, continuations indented two spaces.

## Risks

- **The message strings are the trap.** They look like the same literal and they are not. A
  mechanical find-and-replace across the file will change what doctor prints, and the snapshot
  tests may not catch the gap text. Steps 1 and 2 exist for this, and step 7 verifies it.
- **An import cycle that compiles.** `config.ts` becoming a dependency of seven modules that it
  may already depend on can produce an undefined import at runtime while TypeScript stays happy.
  Starting the CLI is the check, not building it.
- **Concurrent conflict with four other capsules.** These files are contested. Implemented in
  parallel, the merge cost exceeds the benefit of the refactor.
- **Half a refactor is worse than none.** Leaving `manifestPath` where it is, while moving the
  others, creates two conventions where there was one messy convention. Step 3 is a real decision.
- The task is cosmetic by nature. If the research in step 1 shows most occurrences are message
  text, the honest outcome may be a much smaller change than task.md describes. Report that rather
  than manufacturing scope.
