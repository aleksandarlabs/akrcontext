# Context

## Relevant Files

- `src/judge-enforcement.ts:553` — original matchesBlockedPattern
- `src/judge-snapshot.ts:759` — duplicate matchesBlockedPattern

## Blocked Reads

- Secrets and credentials must not be read.
