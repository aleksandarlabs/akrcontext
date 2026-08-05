# TASK-006

## Goal

Give the task capsule a clarification step: resolve ambiguity with the human *before*
implementation, and leave the resolution in the capsule as an artifact the judge can read.

Today `task.md` ships `## Open Questions` with "None recorded yet." and nothing ever
fills it — `taskBody` in `src/templates/instructions.ts:149` says "record open questions"
in half a sentence, with no rule for when to ask, what makes a question worth asking, or
where the answer goes. The result is that an agent facing an underspecified request
predicts an answer instead of asking for one, and the guess is never visible afterwards.

The idea is borrowed from GitHub Spec Kit's `/clarify`, but the shape is different.
Spec Kit clarifies a *spec document* across ~11 categories, capped at 5 questions to stop
the agent inventing questions to look thorough. akrctx clarifies a *unit of work* — three
axes: workflow, validation, scope — so the cap is replaced by a relevance test and no new
command or file is introduced.

## Recommended Workflow

SDD+TDD

## Workflow Notes

- Workflow source: `.akrctx/config.json` `workflowRules.apiOrContract` is `SDD+TDD`.
  This changes the shape of `task.md`, which is read by `readValidationDeclaration`,
  `createJudgeScope` (via `taskDigest`), `compile`, and the judge agent. The section
  format is a contract with consumers this task does not own.
- Why this workflow: the section names and bullet grammar have to be fixed before the
  parser is written, because capsules on disk outlive any parser change. Then each clause
  of the contract becomes a test.
- Context loaded: `src/task.ts` (`taskMarkdown`), `src/templates/wiki.ts`
  (`capsuleTemplates`, the shipped `_template`), `src/templates/instructions.ts`
  (`taskBody`, `skillFiles`), `src/judge-enforcement.ts`
  (`readValidationDeclaration` as the parser precedent, `verifyJudgeRecord`),
  `src/harness-files.ts` (`capsuleFiles`, `protectedFiles`), `src/cli.ts` (verify output),
  `.akrctx/tasks/TASK-005-*/task.md` (house style for a filled capsule).

## Contract

### Sections in `task.md`

Two sections, both inside `task.md`. No new capsule file: `capsuleFiles` is unchanged, so
`createJudgeScope` and Doctor keep requiring exactly the five files they require today.

- `## Clarifications` — resolved ambiguity. Entries are grouped under a
  `### Session YYYY-MM-DD` heading, written when the first question of that session is
  answered. The generated template emits **no** session heading and no date, so capsule
  creation stays deterministic and no stale date is ever stamped.
- `## Open Questions` — ambiguity still unresolved. Stops being a dead placeholder and
  gains a stated meaning.

Both ship with the bullet `- None recorded yet.`, which every consumer treats as empty.

### Entry format

One entry is one top-level `- ` bullet, wrapped with indented continuation lines. Both
sections also carry explanatory prose, and that prose is never content.

The parser therefore cannot accept paragraphs. Widening it would make each section's own
instructions parse as entries, so a freshly generated capsule would report several open
questions that are really its own explanation — noise worse than the gap. The requirement
mirrors `readValidationDeclaration`, which reads only a fenced block for the same reason.

The consequence of instruction and parser drifting apart is that an entry written as a
bare paragraph is invisible: the section reads as empty and no notice is emitted. Every
surface that asks an agent to write an entry therefore states the format — the skill body,
both section prose blocks, and the root instruction file.

### The relevance test

A question exists only if two plausible answers would produce different implementation,
validation, or scope. If every plausible answer leads to the same code, it is not a
question. There is no cap on the number of questions and no budget: the count falls out
of the test. This replaces Spec Kit's cap of 5, which exists to stop invented questions —
the relevance test stops them at the source instead of rationing them after the fact.

There is no "assume and proceed" escape hatch. The relevance test already excludes
trivia, so an escape hatch would only ever license guessing on something that mattered.

### Portability

The question is rendered as enumerated plain text in a normal assistant turn. akrctx
targets four hosts (`src/types.ts:1` — codex, claude, copilot, pi) and only some have a
native question UI, so the portable rendering is the contract and native UI is an
adapter detail, noted in `.akrctx/targets/claude.md` alone. The artifact written to
`task.md` is identical on all four.

### Headless

`akrctx task` from a script or CI has no one to answer. Unresolved ambiguity is recorded
under `## Open Questions` and the capsule is not treated as ready; it is never assumed.

### Reporting, not blocking

`akrctx judge verify` gains a non-blocking `notices: string[]` alongside `reasons`. Open
questions surface there and never flip `approved`. The CLI blocks only what it can
verify mechanically — commands, boundary digests. Whether an open question would have
changed the implementation is a judgement, and wiring a judgement into the exit code
creates a gate whose cheapest workaround is deleting a bullet.

### Backward compatibility

TASK-001 through TASK-005 have `## Open Questions` and no `## Clarifications`.
`clarificationsSectionPresent` is false for them; nothing errors and no notice claims a
missing section. Same treatment `ValidationDeclaration.sectionPresent` gives pre-v2
capsules (`src/judge-enforcement.ts:275`).

## Validation

Commands that prove this task works. The judge must run at least one of these to
approve, and `akrctx judge verify --run-tests` re-runs the ones the review claims
passed. Nothing outside this list is ever executed.

```
pnpm test
pnpm lint
```

## Out Of Scope

- Any new CLI command. There is no `akrctx clarify`; the step lives in the skill.
- Any new capsule file. `capsuleFiles` is not touched.
- Blocking behaviour anywhere: not in `judge verify`, not in `task`, not in the hook.
- Rewriting the existing TASK-001…005 capsules to add the new section.
- Changing `taskDigest` computation or the judge scope contract.
- Doctor gaining a per-capsule audit. The notice on `judge verify` is the whole surface
  for this task; a Doctor rule can follow once the format has been used in anger.

## Clarifications

### Session 2026-08-05

- Q: Do unresolved open questions block `akrctx judge verify` mechanically, or does the
  judge only report them? / A: Report only. The CLI blocks on what it can check itself;
  a gate built on a judgement is one whose cheapest workaround is deleting a bullet.
- Q: Does the clarification step apply to every workflow, or only from `research-first`
  and SDD upward? / A: Every workflow. The relevance test already yields zero questions
  on a `fast-patch`, so excluding by workflow would reintroduce a cap by the back door.

## Open Questions

- Should a test pin the wording of the entry-format requirement, not just its
  consequence? Today the sentence could be deleted from all four surfaces and the suite
  would stay green. A `toContain` in the four-target parity test would close it for one
  line. Left open deliberately: this repo does not pin generated prose anywhere else, so
  doing it here sets a precedent about how the other generated strings get tested, and
  that is the repository owner's call rather than this task's.
