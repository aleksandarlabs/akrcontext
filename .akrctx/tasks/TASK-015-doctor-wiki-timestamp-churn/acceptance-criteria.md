# Acceptance Criteria

- AC-1: Two consecutive doctor runs with unchanged findings leave the wiki files byte-identical
  (no working-tree dirt).
- AC-2: A doctor run after a real finding change updates the report and its timestamp.
- AC-3: `wiki-lint` still sees valid timestamps on all reports.
- AC-4: `pnpm build && pnpm test && pnpm lint` pass.
- AC-5: The review checklist is completed before handoff.
