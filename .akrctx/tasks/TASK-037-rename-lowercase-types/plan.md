# Plan

## Workflow

- fast-patch

## Why

`workflowRules` maps `smallSafePatch` to fast-patch, and this is the clearest example of one in the
current backlog. The compiler proves the whole change: a missed reference does not compile, and a
wrong reference cannot compile into something that runs. There is no behaviour to verify because
type names are erased before anything executes.

`TDD` was rejected: there is no behaviour to drive out, and a test asserting that a type has a name
is a test asserting the compiler works.

`research-first` was rejected: the three declarations and their 62 references are already
enumerated in task.md.

`SDD` was rejected: the types are not a contract with anything. They are not exported from the
package, and nothing outside `src/` names them.

The honest scale of this task: under an hour, cosmetic, and its main risk is being made larger than
it is.

## Steps

1. Confirm `dist/index.d.ts` still contains nothing but the shebang, and that `package.json` still
   has no `main`, `exports` or `types` entry. If either has changed, stop and re-scope — the rename
   becomes a breaking change.
2. Rename `akrctxManifest` first, in `src/manifest.ts`. Seven references, so a mistake in the
   approach shows up on the smallest surface.
3. Build. Fix whatever fails to compile. Nothing else.
4. Rename `akrctxPolicy`, then `akrctxConfig`, building after each.
5. Search for stragglers across `src`, `tests`, `evals` (excluding `.cache/`), `docs`, `README.md`
   and `TUTORIAL.md`. Nothing should be found; run it anyway, since a name inside a string or a
   comment does not fail the build.
6. Read the diff once, end to end, looking only for edits that are not the substitution.
7. `CHANGELOG.md`, additive only, continuations indented two spaces.
8. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **Scope creep is the whole risk.** Sixty-two files open in an editor is an invitation to fix
  small things along the way. Every such fix makes the diff unreadable and hides the one edit that
  was wrong.
- **A rename inside a string or comment.** The compiler will not catch `"akrctxConfig"` in an error
  message or a doc comment. Step 5 exists for this, and whether such a hit should change is a
  judgement call: an error message naming a type the user cannot see is probably wrong either way.
- **An editor-wide replace catching a substring.** `akrctxConfig` does not appear as a prefix of
  another identifier today, but a careless replace can still hit `defaultConfig` patterns if the
  search is loose. Use whole-word matching.
- Doing all three at once is correct, but it makes the diff large enough that a reviewer may skim
  it. Step 2's ordering keeps each build failure small and traceable.
