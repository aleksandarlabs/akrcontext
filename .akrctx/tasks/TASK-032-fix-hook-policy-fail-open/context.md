# Context

## Relevant Files

- `src/hook/index.ts:147` — fail-open catch block
- `src/judge-enforcement.ts:530-534` — fail-closed reference

## Blocked Reads

- Secrets and credentials must not be read.
