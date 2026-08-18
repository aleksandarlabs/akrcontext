# Task

## Goal

Fix broken template pack examples in README and CLI help that reference non-existent template packs.

## Problem

The README (section "Applying templates after init") and `akrctx templates --help` show examples using `company-base` and `security-rules`:

```bash
akrctx templates apply company-base
akrctx templates apply security-rules
```

However, the actual bundled template pack in the repo is `templates/test-template`. `loadBundledTemplatePack` (template-pack.ts:38) throws:

```
Template pack not found or not a directory: company-base
```

Users following the documentation get immediate errors.

## Root Cause

Documentation was written before the actual template packs were finalized, or example packs were planned but never created.

## Solution

Two options:

### Option A: Create the missing template packs (recommended)
Create `company-base` and `security-rules` template packs in `templates/` with sensible defaults, so the examples work.

### Option B: Fix the documentation
Update README and help text to reference the actual existing `test-template` pack:

```bash
# Before
akrctx templates apply company-base

# After  
akrctx templates apply test-template
```

And remove references to non-existent packs.

### Option C: Hybrid
Rename `test-template` to `company-base` (if it's meant to be that) and create `security-rules`.

## Validation

```bash
# Copy examples from README and run them
pnpm akrctx templates apply company-base  # or whatever the docs say
# Should work without "not found" errors
```

## Out Of Scope

- Creating comprehensive template packs (just enough for examples to work)
- Changing the template application logic

## Acceptance Criteria

- [ ] All examples in README work as written
- [ ] All examples in `--help` work as written
- [ ] Users don't get "template pack not found" for documented examples

## Clarifications

### Session 2026-08-18

- **Option B with a rename.** The documentation stops naming `company-base` and `security-rules`,
  and `templates/test-template/` is renamed to a name a user would plausibly want. No new packs are
  invented.
- Creating `company-base` and `security-rules` was rejected: it produces two packs with no owner
  and no reason to be maintained, added only so a documentation example would run.
- Leaving the name as `test-template` was rejected: a first-time reader seeing "test-template" in
  published documentation reads the whole feature as an unfinished prototype. Fixing the broken
  example while leaving that impression trades one problem for another.
- The rename is a **breaking change** for anyone scripting the old name, and is recorded as such in
  `CHANGELOG.md`. The pack is an example shipped for trying the command, so the exposure is small,
  but it is not zero.
- `docs/ENTERPRISE.md:111,117,169` already use `test-template` correctly and must be updated by the
  rename. They are the easiest locations to miss.

## Open Questions

- What is the new pack called? `starter` is the obvious candidate. The name goes in the published
  documentation, so it is worth thirty seconds of thought before the rename lands, and it is
  recorded here rather than chosen silently during implementation.
