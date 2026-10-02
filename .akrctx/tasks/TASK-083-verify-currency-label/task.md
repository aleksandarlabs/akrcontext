# TASK-083 — Say which boundary is current in the verify header

## Goal
Stop the verify header from claiming currency it did not check. `akrctx judge verify` prints
"APPROVED and current" for every approved record, including one whose live boundary is reported
as `DIVERGED` three lines below. The header must name the boundary it means.

## Problem evidence
Observed on a real stored record in this repository:

```
Judge verification: APPROVED and current
  historicalVerdict APPROVED (unknown)
  schema            legacy
  verifiedNow       incomplete — The current workspace no longer matches the reviewed
                    boundary (reviewBoundary: DIVERGED).
```

The verdict is correct. A snapshot approval is designed to survive movement in the live
workspace, which `.akrctx/judge/README.md` states plainly. The header is the problem: in
`src/cli/judge.ts` it prints the fixed string `APPROVED and current` whenever `result.approved`
is true, with no reference to `result.verifiedNow.reviewBoundary`.

"Current" has two possible meanings here, and the output does not say which one it uses. A reader
takes it as "matches my working tree now", which is the one meaning the same output contradicts.
CLAUDE.md tells the primary agent to use `akrctx judge current` to distinguish `CURRENT`,
`NEWER_CHANGES` and `DIVERGED` — an instruction that exists because this distinction matters, and
which a human reading only the header will not know to follow.

## Contract

- An approved record always has the header `Judge verification: APPROVED for the reviewed boundary`.
- Print the already-computed reviewBoundary separately: `CURRENT`, `NEWER_CHANGES` or `DIVERGED`.
  With null, print `not classified for this boundary type`; never convert null to CURRENT.
- Preserve historicalVerdict, verifiedNow and validation trust/re-execution details. Scope
  approval, live applicability and observed validation are distinct facts.
- Keep the existing non-approved path, verdict rules, JSON shape and exit behavior unchanged.
  Do not invoke additional current-state checks or merge the `current` command into verify.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope
- Changing when a record is approved. The snapshot approval rule stays exactly as it is.
- Merging `akrctx judge current` into `verify`. The separate command stays.
- Changing the JSON output shape. `verifiedNow.reviewBoundary` already carries the fact; only
  the human-readable header is wrong.

## Clarifications

Ambiguity resolved with the human before implementation. One answer per top-level `- ` bullet.

### Session 2026-10-01
- The user requested corrections to these capsules after the design review. This revision
  applies the scope and consistency corrections from that review; it does not implement the
  proposed CLI features. Unresolved contract choices remain under Open Questions.

## Open Questions

- None.
