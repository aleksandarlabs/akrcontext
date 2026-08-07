# Acceptance Criteria

- `src/cli.ts` contains only program assembly and `register*` calls (target: under ~150
  lines); no command definition remains in it.
- Snapshot tests capture the full `--help` surface before the move and pass unchanged
  after it.
- All existing tests pass without modification of their expectations.
- `pnpm build && pnpm test && pnpm lint` pass.
- The review checklist is completed before handoff.
