# Review Checklist

- [x] Goal, scope and behavior contract recorded before implementation.
- [x] Config, policy and relevant source inspected; blocked files avoided.
- [x] Focused tests pass.
- [x] Build, full tests, lint and required CLI checks run.
- [x] Documentation and shipped instructions agree with implementation.
- [x] Capsule ready for independent review; invocation requires user confirmation.
- [x] Independent judge reviewed SNAPSHOT:76b384caab5aea147326; verdict NEEDS_CHANGES, one issue.
- [x] Judge record saved and run through `akrctx judge verify --run-tests`; reported INVALID as expected.
- [x] The reported issue is fixed: `snapshot-build` is emitted and pinned by an integration test.
- [x] Re-review on a fresh snapshot SNAPSHOT:017ee67cdab234ad844d returns APPROVED with no issues.
- [x] `judge verify --run-tests` reports APPROVED and current; all five declared commands re-executed independently.
- [x] `judge current` reports CURRENT.
- [x] First measured pipeline baseline recorded in log.md. Comprehension gate is disabled in config; no handoff required.
- [x] Changelog updated under Added and Fixed.
- [x] Catch-up snapshot SNAPSHOT:ec67078d29123053a08f reviewed; APPROVED with no issues.
- [x] `judge verify --run-tests` reports APPROVED and current; `judge current` reports CURRENT.
- [x] Delivery closed. Ready to commit.
