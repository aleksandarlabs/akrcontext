# Acceptance Criteria

- AC-1: Without --timings, existing outputs and judge behavior are unchanged.
- AC-2: With --timings, snapshot and verify emit parseable stderr timing diagnostics on success and failure without contaminating stdout JSON.
- AC-3: Timings use a monotonic clock, capture actual phases including failed commands and approval wait, and distinguish nested inclusive measurements.
- AC-4: Diagnostics contain no command strings, paths, source content, secrets or environment values; no external calls or persistence are introduced.
- AC-5: Required validation, independent re-execution, isolation and exact-command approval remain enforced.
- AC-6: Shipped instructions consistently allow judge validation only in disposable copies and require trusted caller verification; dependency preparation matches current implementation.
- AC-7: Documentation explains collection, interpretation and unmeasured agent/user latency. Focused tests and repository handoff checks run.
