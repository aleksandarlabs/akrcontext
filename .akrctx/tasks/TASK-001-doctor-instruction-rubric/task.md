# Task

## Goal

Give `akrctx-doctor` an explicit rubric for judging instruction files. Doctor currently
says "audit agent instructions" but defines no criteria for what belongs in an
instruction file or where. The merge protocol tells it *how to edit safely*; nothing
tells it *what is worth keeping*.

Add a placement rubric to `doctorBody` covering:

- load tiers (always / on match / on invocation) and their cost profile
- the four per-line verdicts, with `move` as the primary one
- what to keep vs. drop in an always-loaded file
- routing metadata failures (`applyTo` too broad, missing, or wrong; descriptions
  that do not name trigger conditions; the same rule at two tiers)
- a persistent destination for the semantic audit that the mechanical Doctor CLI
  does not overwrite
- documentation that distinguishes the deterministic CLI from the semantic Doctor skill

## Acceptance Criteria

See `acceptance-criteria.md` in this capsule. It is the file `akrctx judge scope`
fingerprints; keeping the criteria inline here instead would block the judge.

## Validation

```
pnpm test
pnpm lint
```

## Out Of Scope

- Editing `.claude/skills/akrctx-doctor/SKILL.md` directly. It is generated output;
  editing it would be overwritten on the next init/upgrade.
- Changing Doctor's deterministic diagnosis or readiness scoring.
- Work outside this task capsule's agreed scope.

## Open Questions

- Provenance: the rubric is derived from the `agent-manifest` skill maintained at
  `/Users/alex/code/agent-manifest` (same author). Attribution is not legally
  required but the two copies will drift. Decide later whether akrctx references
  it or owns an independent derivative. Not blocking.
