# Acceptance Criteria

- `akrctx task` writes `task.md` containing `## Clarifications` and `## Open Questions`,
  both with `- None recorded yet.`, and containing no date. Two runs of `akrctx task`
  with the same description produce byte-identical `task.md`.
- The shipped `.akrctx/tasks/_template/task.md` carries the same two sections.
- `capsuleFiles` is unchanged: the capsule is still exactly five files.
- `readClarificationState` returns the bullets of each section, joins bullets wrapped
  across lines into one entry, and returns `[]` when the only bullet is the placeholder.
- On a capsule with no `## Clarifications` section, `readClarificationState` returns
  `clarificationsSectionPresent: false` and throws nothing.
- `verifyJudgeRecord` reports unresolved open questions in `notices` and never lets them
  change `valid` or `approved`. An APPROVED record on a capsule with open questions still
  verifies as approved, and `judge verify` still exits 0.
- The `akrctx-task` skill states the relevance test, that there is no cap, the plain-text
  question format, that answers go under `## Clarifications` with a dated session
  heading, that answers changing a criterion propagate to `acceptance-criteria.md`, and
  that headless runs record instead of assuming.
- Every place that tells an agent to write an entry also demands the format the parser
  reads: one entry per top-level `- ` bullet. That means the skill body, the prose of
  both sections in the generated capsule and the shipped `_template`, and the root
  instruction file. A test pins the consequence of instruction and parser drifting
  apart — an entry written as a bare paragraph parses as empty.
- The identical skill text reaches all four targets (`.claude/`, `.agents/`, `.github/`,
  `.pi/`); only `.akrctx/targets/claude.md` mentions a native question UI. Both halves
  are asserted by tests, not left to construction or to a one-off manual check.
- Existing agent instruction files are preserved: `CLAUDE.md` is edited only after the
  exact diff is shown and approved in conversation.
- An eval scenario asserts that a CLI-created capsule carries both sections and no
  stamped session date. Asserting that an *agent* asks rather than guesses is out of
  reach for this harness — it runs CLI processes, not a model — so it is not claimed
  here and the reasoning is recorded in plan.md step 9.
- `pnpm test`, `pnpm lint` and `pnpm build` pass; `pnpm eval` runs.
