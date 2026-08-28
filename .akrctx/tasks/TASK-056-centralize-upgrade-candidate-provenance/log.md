# Implementation Log

## 2026-08-28

- Workflow: `SDD+TDD`, selected in the existing capsule because this refactor protects a
  destructive boundary and an observable internal contract.
- Created branch `task-056-centralize-upgrade-candidate-provenance`; the requested `codex/`
  namespace was unavailable because Git uses `.git/refs/codex` for internal checkpoints.
- Replaced the caller-owned `createdCandidate` set and deferred ledger pass with
  `UpgradeCandidateWriter`, used by managed-file conflicts, root instructions, invalid
  manifest repair, and invalid policy repair.
- Updated `CHANGELOG.md`; no user-facing documentation required because the behavior and
  public result format are unchanged.
- Validation so far: `pnpm vitest run tests/akrctx.test.ts` — 349 tests passed.
- Full validation: `pnpm build`, `pnpm lint`, `pnpm test` (848 tests), `pnpm akrctx init --target codex --dry-run`,
  and `pnpm akrctx doctor --json` (readiness 100%) passed.
- Follow-up after review: manifest replacement candidates now carry a self-describing canonical
  provenance hash; cleanup computes the same hash after installation. Added regressions for
  manifest lifecycle and root-instruction creation, preexistence, and dry-run behavior.
- Follow-up validation: targeted regressions passed (4 tests); full `pnpm test` passed with 852 tests.
- Review follow-up: replaced the self-asserted manifest provenance with external runtime-local
  ledger state, added foreign-candidate and tampering end-to-end regressions, and made remove
  discard the runtime ledger with the installation.
- The explicit two-directory foreign-candidate reproduction reports `removed: []` and
  `candidateExists: true` after installing the foreign candidate and rerunning upgrade.
- Final local validation: lint, build, and all 855 tests passed; init dry-run and doctor report
  no conflicts with readiness 100%.
- Judge follow-up found and the implementation fixed a dry-run ordering/ownership mismatch in
  `remove --all`: the runtime ledger is excluded from preserved local records and is previewed
  as removable without being deleted during dry-run. Added a preview-vs-force regression.
