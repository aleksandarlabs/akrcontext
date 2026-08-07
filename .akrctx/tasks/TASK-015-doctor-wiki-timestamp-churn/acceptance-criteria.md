# Acceptance Criteria

- Two consecutive doctor runs with unchanged findings leave the wiki files byte-identical
  (no working-tree dirt).
- A doctor run after a real finding change updates the report and its timestamp.
- `wiki-lint` still sees valid timestamps on all reports.
- `pnpm build && pnpm test && pnpm lint` pass.
- The review checklist is completed before handoff.
