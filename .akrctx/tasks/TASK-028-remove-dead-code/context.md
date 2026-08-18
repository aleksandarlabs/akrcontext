# Context

## Relevant Files

- `src/format.ts` — unused `b` export
- `src/fs-utils.ts` — unused `toPosix`
- `src/impl.ts` — unused `implementerAgentFiles`
- `src/judge.ts` — unused `removeJudgeFiles`
- `src/types.ts` — inconsistent naming (akrctxConfig, akrctxPolicy)

## Blocked Reads

- Secrets and credentials must not be read.
