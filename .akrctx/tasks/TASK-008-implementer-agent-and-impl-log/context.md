# Context

## Relevant Files

- `src/harness-files.ts` — `capsuleFiles` is the five-entry typed constant that feeds
  `taskDigest`; it must not grow. Note that `targetRequired` and `neutralRequired` are
  unconditional: everything listed there and missing from disk counts as drift. The judge
  agent files are deliberately absent from them, and the implementer follows that
  precedent — an opt-in file cannot be an always-required one.
- `src/doctor.ts` — `getJudgeGap` is the actual mechanism by which Doctor accounts for an
  opt-in agent: it fires only when the feature is enabled and the files are missing. The
  implementer needs its sibling, not an entry in the required lists.
- `src/judge.ts` — `runJudgeEnable` is the precedent for opt-in enablement: it writes the
  per-target agent files and then persists `judge.enabled`. `akrctx impl enable` mirrors it
  with `impl.enabled`.
- `src/upgrade.ts` — `judgeAgents` and `comprehensionAgents` are regenerated only when the
  corresponding config flag is true. This is why the intent has to be persisted rather than
  inferred from the presence of a file.
- `src/judge-enforcement.ts` — `taskDigest` is computed over `capsuleFiles` only, and the
  diff that produces `scope.changedFiles` is filtered solely by `blockedReadPatterns`.
  Both facts are why the implementation log lives outside the capsule and outside git.
- `src/templates/judge.ts` — the precedent for multi-host agent emission:
  `.claude/agents/akrctx-judge.md`, `.github/agents/akrctx-judge.agent.md`, and
  `.codex/agents/akrctx-judge.toml`. The implementer mirrors this shape.
- `src/templates/comprehension-agent.ts` — the second precedent, and the existing example
  of an agent whose instructions acknowledge a host limitation rather than pretending it
  away.
- `src/types.ts` — `JudgeConfig` and `ComprehensionGateConfig`, and the optional `judge?`
  field on the config interface. `ImplConfig` follows the same shape and is optional for
  the same reason: absent must mean off, so old configs keep loading.
- `src/cli.ts` — where the `impl` command group and `impl enable` are registered.
- `.akrctx/local/.gitignore` — ignores `*`, which is what keeps the implementation log out
  of every review boundary.
- `.akrctx/tasks/TASK-006-clarification-gate/acceptance-criteria.md` — pins the capsule at
  five files and defines how the clarification gate parses bullets.
- `.akrctx/tasks/TASK-007-immutable-judge-snapshots/task.md` — the snapshot boundary this
  task must not disturb.

## Prior Findings

An external review of the delegation design produced the reasoning behind this capsule.
Three findings are carried into the contract:

- An implementation log stored inside the capsule becomes a tracked file in the review
  diff, which would let the judge read the implementing agent's own account as evidence.
- Ambiguity written to a log nobody parses bypasses the clarification gate, because
  `verifyJudgeRecord` reads only top-level bullets under `## Open Questions` in `task.md`.
- An attempt limit expressed only in agent prose cannot survive fresh contexts, because
  each new instance believes it is the first.

## Blocked Reads

- Secrets and credentials must not be read.
