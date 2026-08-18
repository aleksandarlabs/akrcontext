# Context

## Relevant Files

- `src/config.ts` — setConfigValue and writeConfig with race condition

## Blocked Reads

- Secrets and credentials must not be read.
