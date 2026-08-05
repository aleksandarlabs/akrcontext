---
name: akrctx-task
description: Use when turning a development request into a akrctx task capsule.
---

# akrctx-task

Turn the request into a task capsule with goal, scope, context, explicit workflow choice, acceptance criteria, validation commands, and an implementation brief.

## Clarify before implementing

Resolve ambiguity with the human before writing code, and leave the resolution in the capsule where the judge can read it.

**When a question exists.** Ask only when two plausible answers would produce different implementation, validation, or scope. If every plausible answer leads to the same code, it is not a question — do not ask it.

**How many.** There is no cap and no budget; the count falls out of the test above. A well-specified patch yields zero questions. An undefined contract yields as many as it takes. Never pad the list to look thorough, and never stop while a real ambiguity is left.

There is no "assume and proceed" option. The test above already excludes trivia, so assuming would only ever mean guessing about something that mattered.

**How to ask.** Plain text in a normal turn: one question, its alternatives enumerated, and what each would change. Ask one at a time so a later question can use an earlier answer. Decide matters of style yourself, and do not ask the human to design the implementation for you.

**Where the answer goes.** After each answer, before asking the next, append it under `## Clarifications` in task.md beneath a `### Session YYYY-MM-DD` heading carrying today's date. If the answer changes a criterion, propagate it into acceptance-criteria.md. The capsule is the artifact; the conversation is not.

**What stays open.** Ambiguity you did not resolve goes under `## Open Questions`, written as a question. Running headless with nobody to answer, that is the correct outcome: record it and treat the capsule as not ready. Never close the gap by prediction.

**Format, in both sections.** One entry is one top-level `- ` bullet; wrap long entries with indented continuation lines. `akrctx judge verify` reads only top-level bullets, because both sections also carry explanatory prose that must not be mistaken for content. An entry written as a bare paragraph is invisible to it — the section reads as empty and no notice is emitted.
