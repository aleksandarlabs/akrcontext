# Plan

## Workflow

- research-first, then TDD

## Why

`workflowRules` maps `bugfix` to TDD and `unknownArea` to research-first. This task is both, and
the research has to come first for one specific reason: the transient-detection half rests on an
assumption nobody has tested — that an honest review does not perturb inode or ctime on
manifest-covered paths. If that assumption is false, the mechanism produces false positives on
every review, and a check that cries wolf is worse than the gap it closes. That question is
answerable in an hour by measuring, and it decides the design.

The dependency half needs no research. It is a bugfix with a clear property to assert, and TDD
applies directly.

`fast-patch` was rejected: two mechanisms, one of them platform-sensitive, with a documented
guarantee resting on them. `SDD` was rejected: no contract between programs changes — the record
schema, the CLI surface, and the verdict rules are all untouched.

The honest limit: nothing here stops a determined reviewer with shell access from doing damage
akrctx cannot see. This task moves specific breaches from invisible to reported. It does not turn
the snapshot into a sandbox, and the documentation must not start claiming it did.

## Steps

### Research (before writing any fix)

1. Measure the assumption. Capture a snapshot, record inode and ctime for every manifest-covered
   path, run the capsule's declared validation inside it, and re-measure. Any path that moved is
   a false positive the design must handle. Record the result in `log.md` — it is the evidence
   the rest of the task rests on.
2. Repeat on a second platform if one is available. `ctime` semantics and the behaviour of `cp`
   with `preserveTimestamps` are not uniform, and the answer from one machine is not the answer.
3. If the assumption fails, stop and return the finding before implementing. A different
   mechanism is a different task, not an improvisation inside this one.

### Dependencies

4. Read `createJudgeSnapshotValidationWorkspace` (`src/judge-snapshot.ts:270`) and its only
   caller, `src/judge-enforcement.ts:254`.
5. Write the failing test first: plant a marker in the snapshot's `node_modules`, run
   verification, assert the marker is absent from the validation workspace.
6. Change the copy to exclude `node_modules`, then materialise dependencies from the lockfile
   with a frozen install.
7. Cover the failure path: no lockfile, or install fails. Assert verification reports the reason
   and never falls back to the snapshot copy.

### Transient detection

8. Write the failing tests first, all three shapes: write-then-restore-bytes, create-then-delete,
   and the honest-review negative case that must still pass.
9. Extend the fingerprint in `addManifestPath` (`src/judge-snapshot.ts:546`) with the modification
   evidence the research step validated. Keep content in the fingerprint; add to it, do not
   replace it.
10. Give the new failure its own message, distinct from the existing content-mismatch text.
11. Decide and implement the pre-existing-snapshot path, and pin it with a test.

### Close out

12. Update `.akrctx/judge/README.md` and `docs/JUDGE.md`. Read the current wording for claims this
    task proves too strong and correct them; do not only append.
13. `CHANGELOG.md`, new entries only, existing ones untouched, continuations indented two spaces.
14. Run `pnpm lint && pnpm build && npx vitest run` and record the output verbatim.

## Risks

- **False positives are the real failure mode.** A fingerprint strict about modification and
  wrong even occasionally trains developers to ignore integrity failures, which removes the value
  of the check that already works. Step 1 exists to catch this before it ships, and the
  honest-review negative test exists to keep catching it.
- Materialising dependencies makes `verify --run-tests` slower and adds a network dependency
  where there was none. That cost is the point — the previous speed came from trusting bytes
  inside the reviewed artifact — but it will be felt, and the failure path must be legible when
  it bites in CI.
- A frozen install is deterministic only if the lockfile is in the snapshot and intact. The
  lockfile is a tracked file, so it is digest-covered, which is what makes this fix sound. Verify
  that rather than assume it.
- Changing the fingerprint changes every snapshot id, since `snapshotId` derives from
  `workspaceDigest`. Step 11 is not optional bookkeeping; skipping it breaks every existing local
  snapshot with a confusing error.
- This capsule's own review will run on a snapshot captured by the code it changes. Capture the
  review snapshot before the change lands, or the reviewer will be validating the new mechanism
  with the new mechanism.
