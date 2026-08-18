# Context

## Relevant Files

- `src/doctor.ts:394` — suggestedFor (duplicate)
- `src/fs-utils.ts:37` — suggestedPathFor (original)
- `src/upgrade.ts:370` — readProjectName (duplicate)
- `src/init.ts:379` — readProjectName (original)

## Blocked Reads

- Secrets and credentials must not be read.
