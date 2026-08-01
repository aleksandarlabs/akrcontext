# Task

## Goal

Close four gaps in the judge enforcement layer found during the judge review of
2026-08-01. Two are enforcement holes that let an empty approval pass
`akrctx judge verify`; two are CLI plumbing inconsistencies.

1. **An APPROVED record with no executed validation passes verification.**
   `verifyJudgeRecord` only rejects `status: "failed"`, so `tests: []` or a record
   where every entry is `not-run` verifies as approved. An approval can currently
   carry zero evidence that anything was run.

2. **An APPROVED record may list issues.** Nothing requires the verdict to be
   coherent with the findings, so a judge can approve while reporting defects and
   the gate still opens.

3. **`akrctx judge scope` and `akrctx judge verify` bypass `normalizeOptions`** and
   read `process.cwd()` directly, unlike every other command. No `--cwd` flag exists
   on any command today, so runtime behavior is identical — this is a consistency
   fix, not a live bug.

4. **`--json` on `akrctx judge scope` is a no-op.** The flag is declared but the
   command always prints JSON, so there is no human-readable mode and the flag
   misleads.

## Acceptance Criteria

See `acceptance-criteria.md` in this capsule — the file `akrctx judge scope`
fingerprints.

## Validation

```
pnpm test
pnpm lint
```

## Out Of Scope

- The trust gap in who saves the review record. The read-only judge cannot write, so
  the primary agent can run `judge scope` itself and fabricate a valid APPROVED
  record. That is a design decision needing its own task, not a patch.
- Filtering `policy.json` blocked paths out of *tracked* files in the diff boundary.
  Real, but a separate change to `createJudgeScope`.
- Adding `cliVersion` provenance to the review record.
- Any change to the digest algorithm or to `scopeDigest` composition. Existing
  records must keep verifying against the same boundary.
- Adding a `--cwd` flag to the CLI.

## Open Questions

Requiring a passed test to approve means a judge in a sandbox that cannot execute
anything can never return APPROVED. That is intended: an approval without executed
validation is the thing this task removes. The judge instructions must say so
explicitly, or judges will emit records that fail verification for reasons they were
never told about.
