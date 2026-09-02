# Implementation Log

- Selected workflow: `SDD+TDD`, because the task changes security redaction, persisted
  compatibility and the release artifact contract.
- 2026-09-02: Capsule created before implementation; no unresolved ambiguity remains.
- 2026-09-02 red: `pnpm vitest run tests/agents.test.ts tests/akrctx.test.ts
  tests/dogfood.test.ts` failed in the three new regressions: quoted JSON keys retained the
  secret, a phase-less TDD record reported invalid/blocked, and the build command lacked
  `--clean`.
- 2026-09-02 green: the same command passed 469/469 after adding structured-key redaction,
  treating phase-less persisted rounds as legacy missing evidence without blocking the next
  round, and enabling tsup cleanup.
- 2026-09-02: Upgraded the dogfooded harness from 0.5.0 to 0.6.0 through the CLI; protected
  root instructions were preserved and their local candidates remain ignored.
- 2026-09-02: Full release gates passed: build, 870/870 tests, lint, init dry-run and Doctor
  readiness 100. Config-show and task dry-run checks passed. `npm pack --dry-run --ignore-scripts`
  reports 44 entries, 321 KB packed and 1.25 MB unpacked, down from the stale 526-entry package.
