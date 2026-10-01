# Acceptance Criteria

- AC-1: `akrctx judge run <task-id>` executes every command in the capsule's `## Validation` fence exactly once, in an isolated disposable copy of the snapshot, and never in the canonical snapshot or the live project.
- AC-2: The receipt records the snapshot id, the snapshot review digests, the normalized command list, the lockfile digest, and per-command status, exit code and bounded redacted failure evidence.
- AC-3: A receipt is valid only while the snapshot digests, the normalized command list and the lockfile digest all match. Any one mismatch invalidates it and the CLI says which binding broke.
- AC-4: Node version, architecture and operating system are absent from the binding. A Node version change does not invalidate a receipt.
- AC-5: The judge executes no validation command. It reads the receipt for evidence and still reviews code, capsule criteria, scope and `.akrctx/review-policy.md` by reading files.
- AC-6: APPROVED requires a valid receipt in which every required command passed, plus an empty `issues` array. A judge record claiming a passed command with no matching receipt entry is rejected, and the rejection names the command.
- AC-7: `akrctx judge verify` validates the receipt binding without re-running commands. `--run-tests` still forces a fresh run when the caller asks for it.
- AC-8: The existing flow stays usable during the transition. A capsule reviewed under the old contract still verifies.
- AC-9: One review round runs the declared commands once, not three. The `--timings` diagnostics from TASK-071 show the reduction.
- AC-10: Shipped instructions and `docs/JUDGE.md` describe one executor. No template states that the judge runs validation commands.
