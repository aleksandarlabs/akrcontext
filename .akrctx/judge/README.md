# Judge Enforcement Contract

The judge first runs `akrctx judge scope TASK-XXX --base <ref> --candidate <ref|WORKTREE> --json` and copies that exact scope into its review record. A trusted caller saves the judge's JSON output under `.akrctx/local/judge/`; the read-only judge does not write it itself.

Before using an approval, run `akrctx judge verify <review.json> --run-tests`. Verification checks the record shape and recomputes SHA-256 digests for the task capsule and exact code boundary. Any code or task change invalidates the approval. This binds a verdict to evidence; it does not cryptographically prove which model produced the verdict.

An `APPROVED` verdict additionally requires evidence and coherence:

- at least one entry in `tests` with `status: "passed"` — an approval that ran nothing is not an approval
- an empty `issues` array — a verdict cannot approve and report unresolved defects at the same time

A `failed` entry in `tests` invalidates the record under any verdict. If validation cannot run at all, the correct verdict is `BLOCKED`, not `APPROVED`.

When the capsule's `task.md` declares commands in a fenced block under `## Validation`, at least one of them must be the command that passed. A judge cannot satisfy the evidence rule with a command it invented. If the section exists but its block is empty or malformed, the capsule is unfinished and `APPROVED` is rejected; only capsules with no `## Validation` section at all fall back to the weaker rule.

## Independent re-execution

`akrctx judge verify <review.json> --run-tests` re-runs the capsule-declared commands the record claims passed, instead of trusting the claim. It fails if any of them fails, or if running them moved the boundary — validation that rewrites the worktree can exit 0 and leave the repository outside the reviewed change set, so the scope is recomputed afterwards.

Run it from the trusted caller, before any handoff. The judge and the comprehension evaluator are read-only by contract and must not pass this flag.

## What this does and does not prove

It proves the verdict is bound to a specific task capsule and code boundary, that the boundary still matches the repository, and — with `--run-tests` — that the declared validation really passes and left the boundary intact.

It does not prove which model produced the verdict. The judge is read-only by design, so a trusted caller writes the record, and that caller could in principle write one the judge never produced. Nothing in this repository can close that gap. The mitigation is human: the judge's prose review appears in the session transcript, and the developer reads it. Treat a verified record as tamper-evident bookkeeping, not as an unforgeable signature.

`--run-tests` narrows that gap without closing it. A review record can never inject a command, because only declared commands run. But the capsule itself is normally written by the primary agent, so the flag moves trust from the record to `task.md` rather than removing it. It is not a defence against a compromised primary agent, which could write both. Read `task.md` before running it on work you did not supervise.

## Withheld paths

Files matching `blockedReadPatterns` in `policy.json` are excluded from the diff and listed by path in `scope.excludedPaths`. Their contents are never read or fingerprinted. The path list is part of the boundary digest, so a secret appearing or disappearing still invalidates a stale approval. A judge that cannot review meaningfully without those files should report `BLOCKED`.
