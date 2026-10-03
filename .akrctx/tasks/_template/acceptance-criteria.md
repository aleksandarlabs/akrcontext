# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

A criterion can declare the evidence it expects on indented lines under its bullet. Write `proof-command: <command>` to name a command from `## Validation` in task.md. Write `proof-doc: <path>[#Heading]` to point the judge at a repository file. Both are optional, with one reference per line. Add no proof to a criterion that needs judgment.

- AC-1: State each criterion so it can be checked, not interpreted.
- AC-2: Existing agent instruction files are preserved unless a human approves a merge.
- AC-3: Relevant validation commands are documented or run.
- AC-4: The review checklist is completed before handoff.
