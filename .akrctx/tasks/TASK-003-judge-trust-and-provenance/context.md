# Context

## Relevant Files

- `src/judge-enforcement.ts:52` — `createJudgeScope`. The blocked-path handling and the
  new `cliVersion` / `excludedPaths` scope fields live here.
- `src/judge-enforcement.ts:148` — `verifyJudgeRecord`, now taking `JudgeVerifyOptions`.
- `src/judge-enforcement.ts` — `readDeclaredValidationCommands`, which parses the
  capsule's `## Validation` fence, and `runValidationCommand`, the only place this
  codebase executes a command derived from a file.
- `src/judge-enforcement.ts:13` — `JUDGE_SCHEMA_VERSION`, the single source for the
  contract version. `src/templates/judge-contract.ts` derives `JUDGE_SCHEMA_ID` from it
  and `src/judge.ts:75` checks that identity in `requireJudgeContract`.
- `src/task.ts:188` — `taskMarkdown`, and `src/templates/wiki.ts:244` — the shipped
  `_template/task.md`. Both now emit a `## Validation` section with an empty fence.
- `src/cli.ts` — `judge scope` prints withheld paths; `judge verify` gained
  `--run-tests`.
- `tests/akrctx.test.ts` — `createReviewFixture` takes `declares` and `claims`.

## Design Notes

**Why exclusion pathspecs, not post-filtering.** Blocked paths are removed from the
diff via `:(exclude,literal)<path>` passed to `git diff`. Filtering the diff text
afterwards would be too late — the content would already be in the buffer that feeds
`changeDigest`. Git is asked not to produce it at all.

**Why the excluded path list is still digested.** Paths only, never content. Without
it, adding or removing a secret inside the boundary would not move the digest and a
stale approval would survive a real change to the change set.

**Why only capsule-declared commands are ever executed.** `--run-tests` runs strings
that came from a file. `task.md` is human-authored, at the same trust level as
`package.json` scripts. The review record is agent-authored, so nothing in it reaches
a shell. This is why the declared-command allowlist had to exist before `--run-tests`
could.

## Rejected: nonce handshake

The first design for the trust gap was a session nonce: the caller runs
`akrctx judge session start`, hands the nonce to the judge, the judge echoes it into
the record, and `verify` consumes it single-use.

It was dropped because it proves nothing. The caller mints the nonce, so a caller
willing to fabricate a record is equally willing to paste the nonce into it. It would
have added session state, expiry, and cleanup in exchange for the appearance of a
guarantee. Re-running the validation independently is the part that actually removes
trust, so that was built instead.

## Blocked Reads

- Secrets and credentials must not be read. This task changes how they are handled;
  it does not require reading any.
