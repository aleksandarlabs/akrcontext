# Context

## Relevant Files

- `src/doctor.ts` — `runDoctor` regenerates the wiki reports (`agent-setup.md`,
  `gaps.md`, `recommendations.md`) on every run.
- `src/templates/wiki.ts` — owns the report templates including the `timestamp:`
  frontmatter field.
- `src/wiki-lint.ts` — `missingTimestamps` check reads these timestamps; any change must
  keep the field present and parseable.
- `src/fs-utils.ts` — `safeWrite`; check whether a content-comparison helper already
  exists (TASK-012 introduced honest content comparison for writes).

## Prior Findings

- Observed during review: running `doctor --json` once modified three tracked wiki files
  with no content change beyond `timestamp:`.
- The wiki files are tracked in git, so each doctor run creates commit noise or forces
  users to `git checkout --` them.

## Blocked Reads

- Secrets and credentials must not be read.
