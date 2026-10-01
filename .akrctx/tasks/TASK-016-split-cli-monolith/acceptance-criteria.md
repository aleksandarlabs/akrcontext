# Acceptance Criteria

- AC-1: `src/cli.ts` contains only program assembly and `register*` calls (target: under ~150
  lines); no command definition remains in it.
- AC-2: Snapshot tests capture the full `--help` surface before the move and pass unchanged
  after it.
- AC-3: All existing tests pass without modification of their expectations.
- AC-4: `pnpm build && pnpm test && pnpm lint` pass.
- AC-5: The review checklist is completed before handoff.
