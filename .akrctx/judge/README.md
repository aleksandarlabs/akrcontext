# Judge Enforcement Contract

The judge first runs `akrctx judge scope TASK-XXX --base <ref> --candidate <ref|WORKTREE> --json` and copies that exact scope into its review record. A trusted caller saves the judge's JSON output under `.akrctx/local/judge/`; the read-only judge does not write it itself.

Before using an approval, run `akrctx judge verify <review.json>`. Verification checks the record shape and recomputes SHA-256 digests for the task capsule and exact code boundary. Any code or task change invalidates the approval. This binds a verdict to evidence; it does not cryptographically prove which model produced the verdict.
