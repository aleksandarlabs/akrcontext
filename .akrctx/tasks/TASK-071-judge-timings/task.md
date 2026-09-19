# TASK-071 — Judge timing diagnostics

## Goal
Measure the existing judge pipeline locally and resolve contradictory execution instructions before redesigning approval. First delivery only.

## Contract
Opt-in `--timings` on `judge snapshot` and `judge verify` emits one machine-readable diagnostic JSON line to stderr, including elapsed milliseconds and phase status, even on failure. Normal stdout, exit status, review schemas and approval behavior remain unchanged. Diagnostics contain fixed phase names and numeric command indices, never commands, file contents, paths, or environment values. No network telemetry or automatic persistent files. Operators may redirect stderr to a local file. Nested durations are inclusive and must not be summed. CLI measures capture, verification, command approval wait, disposable workspace copy, dependency preparation, individual validation commands and cleanup where observable. External agent review and pre-invocation human wait are explicitly unmeasured; do not infer model latency from wall-clock gaps.

## Out Of Scope
- Runner redesign, caching or skipping validations; Jev/provider integration; automatic judge invocation; changing approval guarantees or protected installed instructions.

## Clarifications
### Session 2026-09-19
- User authorized the first delivery proposed in conversation: local instrumentation and coherent instructions, preserving approval guarantees, with token-conscious implementation and optional programming subagents.
- Diagnostics are opt-in stderr output to preserve existing JSON consumers and avoid adding tracked or persistent telemetry.

## Open Questions
- None.

## Validation
```sh
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```
