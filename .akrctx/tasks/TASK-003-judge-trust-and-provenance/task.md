# Task

## Goal

Close the three judge gaps TASK-002 deferred: the trust gap in review records, the
policy leak in the change boundary, and missing version provenance.

1. **Nothing binds an approval to executed evidence.** A record could claim
   `tests: [{ command: "echo ok", status: "passed" }]` and satisfy the TASK-002
   evidence rule. More broadly, the read-only judge cannot write its own record, so a
   trusted caller saves it — and that caller could write one the judge never produced.

2. **`policy.json` blocked paths leak into the boundary.** `createJudgeScope` checked
   `blockedReadPatterns` only for untracked files. A tracked `.env` changing inside the
   boundary had its content hashed into `changeDigest` and its path handed to the judge
   in `changedFiles`, with only a prompt instruction telling the judge not to read it.
   The untracked branch had the opposite problem: it aborted the entire scope, which
   breaks on `.env.example` — matched by `.env.*` and not a secret.

3. **Review records carry no provenance.** Nothing records which akrctx version
   produced a verdict, so a record written under one set of approval rules verifies
   silently under another. TASK-002 changed what APPROVED means, which makes this
   concrete rather than theoretical.

## Acceptance Criteria

See `acceptance-criteria.md` in this capsule.

## Validation

```
pnpm test
pnpm lint
```

## Out Of Scope

- Proving which model authored a verdict. This is not solvable inside the repository:
  the trusted caller has write access and the judge does not. Documented honestly
  instead of papered over with ceremony — see the Open Questions below.
- A nonce or session handshake between caller and judge. Considered and rejected
  during this task; the reasoning is in `plan.md`.
- Migrating existing v1 review records. They are bound to a code boundary that has
  already moved, so they are invalid anyway.
- Backfilling `## Validation` into task capsules that already exist.

## Open Questions

The residual trust gap is real and stays open. A record that verifies proves the
verdict is bound to this task and this boundary, and — with `--run-tests` — that the
validation genuinely passes. It does not prove a judge produced it. Closing that needs
a trust anchor outside the repository, such as a signing key held by CI rather than by
the agent. Not attempted here.
