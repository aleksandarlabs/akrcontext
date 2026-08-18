# Context

## Relevant Files

- `src/impl.ts` — vulnerable impl commands
- `src/judge-enforcement.ts` — requireTaskId() reference

## Blocked Reads

- Secrets and credentials must not be read.
