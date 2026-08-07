# Task

## Goal

Every `akrctx doctor` run rewrites the wiki report frontmatter timestamps even when the
report content is identical, producing dirty files on each run:

```
$ akrctx doctor --json   # twice, nothing changed in between
$ git diff --stat
 .akrctx/wiki/agent-setup.md      | 4 ++--
 .akrctx/wiki/gaps.md             | 2 +-
 .akrctx/wiki/recommendations.md  | 4 ++--
```

A read-only-feeling audit command should not dirty the working tree when nothing it
reports has changed. Timestamp the report when its content changes; leave the file
untouched otherwise.

## Validation

```
pnpm build && node dist/index.js doctor --json && git diff --quiet -- .akrctx/wiki
```

plus

```
pnpm test
```

## Out Of Scope

- Changing what doctor reports or its scoring.
- Whether wiki reports should be committed at all (separate discussion).
- The `.codex/` reproducibility issue tracked in TASK-014.

## Clarifications

- None recorded yet.

## Open Questions

- None.
