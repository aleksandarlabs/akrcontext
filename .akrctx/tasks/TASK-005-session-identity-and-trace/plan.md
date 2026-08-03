# Plan

## Workflow

SDD+TDD

## Steps

1. The contract is written in `task.md` (payload normalization, failure contract, record
   shape). Encode each clause as a failing test before implementing it.
2. `src/hook/trace.ts` — record types, JSONL append, session file resolution, reader that
   tolerates truncated lines (AC15).
3. `src/hook/payload.ts` — dialect-tolerant normalization (AC4–AC7).
4. `src/hook/index.ts` — `runHook(event, rawStdin, cwd)`: normalize, classify, append,
   return a no-decision response. Every failure path returns the same no-decision result;
   nothing throws out of this function (AC1, AC2).
5. `src/hook/report.ts` — replay traces, derive predicates, emit both candidate
   definitions of an active capsule (AC13, AC14).
6. `src/hook/install.ts` — write host configuration by merging into existing files, never
   replacing them (AC17, AC18).
7. Wire `akrctx hook <event>` (hidden) and `akrctx trace enable|disable|status|report`
   into `cli.ts`, keeping the module/printer split the rest of the CLI uses.
8. Measure the hot path against the 1.5s SessionEnd budget and assert a bound (AC3).
9. `pnpm test`, `pnpm lint`.
10. Do **not** enable tracing in this repository as part of the task. It is opt-in
    (AC19); enabling it here is the user's call, not a side effect of implementing it.

## Risks

- The failure contract is the load-bearing one. A crash in the hook denies every tool call
  on Copilot. Tests must cover the ugly inputs directly, not just the happy path.
- Writing host configuration touches files the user owns (`.claude/settings.json` and
  friends). Merge, never rewrite, and prove it with a test that plants unrelated keys.
- Appending on every tool call will produce large traces in long sessions. Acceptable for
  a two-week measurement; note it rather than pre-optimizing.
