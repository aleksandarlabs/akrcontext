# Context

## Relevant Files

- `src/impl.ts` — the attempt store. `runImplStatus`, `runImplStart`, and `runImplLog` share
  `ImplStatusResult`, so a refusal reason added to the status result reaches all three.
  The module docstring is where the unverified privacy claim is stated.
- `src/comprehension.ts` — holds `isLocalIgnoreContentSafe` and `hasValidLocalIgnore`, the
  check point 1 reuses, and the `runComprehensionEnable` guard whose shape points 1 and 4
  copy.
- `src/config.ts` — `normalizeAgents` (point 2), `writeAgentKey`, and the `readConfig` path
  every command runs through.
- `src/agents.ts` — `resolveAgent` and `agentWarnings`, the single resolution point for the
  `agents` block. Point 2's warning belongs here, next to the other never-fatal ones.
- `src/judge.ts` — `runJudgeEnable`, the one enable command with no empty-target guard.
- `src/cli.ts` — the `impl log --record` branch, the only unvalidated input into the store.
- `src/doctor.ts` — `getConfigGaps` raises the unknown-entry gap by parsing raw JSON;
  once point 2 makes it a resolved warning, that raw check duplicates it.
- `tests/agents.test.ts` — the suites for the agents block, the attempt store, and doctor.

## Prior Findings

- `.akrctx/local/.gitignore` is written by `akrctx init` and repaired by `akrctx doctor
  --fix`. Its safe form is exactly two rules, `*` and `!.gitignore`, so it covers
  `.akrctx/local/impl/` without any impl-specific entry.
- `isManifestManagedPath` gained `.claude/agents/`, `.github/agents/`, and `.codex/agents/`
  in TASK-009. Obsolete detection intersects those prefixes with the previous manifest, so
  a user's own agent files in those directories are never touched.
- `tests/agents.test.ts:543` supplies a fixed `timestamp` to a round record, so point 3's
  validator must keep accepting a caller-supplied ISO instant.

## Blocked Reads

- Secrets and credentials must not be read.
