# Context

## Relevant Files

- `src/config.ts` — configPath definition
- `src/doctor.ts`, `src/status.ts`, `src/task.ts`, `src/judge-enforcement.ts`, `src/judge-snapshot.ts`, `src/template-apply.ts`, `src/upgrade.ts` — hardcoded paths

## Blocked Reads

- Secrets and credentials must not be read.
