# Plan

## Workflow

- research-first, then fast-patch

## Why

`workflowRules` maps `unknownArea` to research-first and `smallSafePatch` to fast-patch.

Research comes first for two reasons, neither of which is technical. The occurrence list in
task.md is incomplete — it names the README and `--help`, and misses `docs/COMMANDS_AND_UX.md`
and `docs/CONFIGURATION.md`. Fixing a documentation defect while leaving two files still wrong is
the same defect with better coverage. And the three options in task.md produce different
repositories: creating packs, renaming a pack, or changing the docs are not variations of one
change, and choosing between them is a product decision about what a new user should see first.

fast-patch then applies. Whichever direction is chosen, the edit is small and the check is running
the commands.

`TDD` was rejected as the lead workflow: the deliverable is correct documentation, and the test
that matters is executing the documented commands. A guard test is still added, but afterwards.

`SDD` was rejected unless packs are renamed, in which case a pack name becomes a breaking change
and `CHANGELOG.md` carries that weight instead.

## Steps

### Research

1. Enumerate every reference to a template pack across `README.md`, `docs/`, `src/` and
   `templates/`. The known list is `README.md:214-215`, `docs/COMMANDS_AND_UX.md:105,107`,
   `src/cli/templates.ts:41,43` and `docs/CONFIGURATION.md:150`. Confirm it is complete and put
   the table in `log.md`.
2. Note which references are already correct: `docs/ENTERPRISE.md:111,117,169` use `test-template`.
   A rename breaks them, and that cost belongs in the decision.
3. Choose the direction and record it under `## Clarifications` in task.md with the reasoning.
   The question is what a first-time reader should type and find working.
4. If the docs will point at `test-template`, decide whether that name is acceptable in published
   examples. It reads as unfinished. Either rename it to something a user would plausibly want, or
   have the docs say plainly it is an example pack shipped for trying the command.

### Implement

5. Apply the chosen direction to all four locations.
6. Handle `docs/CONFIGURATION.md:150` explicitly. It is a config sample, not a runnable command, so
   an illustrative name may be fine — but only if the surrounding text makes clear the reader
   supplies the pack.
7. If packs are created, each is a real pack `loadBundledTemplatePack` accepts, with an
   `akrctx-pack.json` matching `templates/test-template/akrctx-pack.json`, and it ships through the
   `templates` entry already in the root `package.json` `files` array.

### Prove

8. Copy every documented command verbatim into a scratch repository and run it. Paste the
   transcript into `log.md`. This is the acceptance evidence; reading the docs is not.
9. Add a guard test asserting every pack name appearing in documentation and help text exists
   under `templates/`, so this cannot silently break again.
10. Improve the `loadBundledTemplatePack` failure message to name the packs that do exist, and
    cover it with a test.
11. `CHANGELOG.md`, additive only, continuations indented two spaces. A rename is a breaking change
    for anyone scripting it and is recorded as such.
12. `pnpm lint && pnpm build && npx vitest run`, output recorded verbatim.

## Risks

- **Fixing three of four locations.** The most likely outcome if step 1 is skipped, and the one
  that makes the whole task pointless — a user hits the remaining broken example instead.
- **`test-template` in published documentation reads as unfinished.** Fixing the error while
  leaving the impression that the feature is a prototype trades one problem for another.
- **A rename breaks `docs/ENTERPRISE.md` and anyone scripting the old name.** It is the tidiest
  end state and the most expensive one.
- **Inventing packs nobody needs.** Creating `company-base` and `security-rules` to satisfy a
  documentation example produces two packs with no owner and no reason to be maintained. If they
  are created, they must be genuinely useful or the docs should stop naming them.
- Nothing here is covered by the existing tests, which is why the examples broke in the first
  place. Step 9 is the part that prevents a repeat.
