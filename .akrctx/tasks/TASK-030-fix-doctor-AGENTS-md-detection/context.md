# Context

## Relevant Files

- `src/doctor.ts:331-336` — getInstalledTargets with false positive
- `src/manifest.ts` — for proper install detection

## Blocked Reads

- Secrets and credentials must not be read.
