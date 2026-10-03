# Acceptance Criteria

Every criterion is one top-level `- ` bullet that starts with `AC-<n>: `. The judge reports a
typed result per identifier, so identifiers must be unique and must never be reused for a
different criterion. Indented lines continue the bullet above them.

A criterion can declare the evidence it expects on indented lines under its bullet. Write `proof-command: <command>` to name a command from `## Validation` in task.md. Write `proof-doc: <path>[#Heading]` to point the judge at a repository file. Both are optional, with one reference per line. Add no proof to a criterion that needs judgment.

- AC-1: CHANGELOG.md has one accurate entry for each user-observable change of TASK-076, 077,
  078, 079, 081, 082, 083 and 084, in the correct category. The TASK-080 entry remains.
  proof-doc: CHANGELOG.md
- AC-2: No entry describes behavior the code does not have. Each entry matches the merged code
  and the capsule's confirmed contract.
- AC-3: `docs/COMMANDS_AND_UX.md` documents `akrctx judge rounds` and `akrctx judge reproduce`
  with their flags.
  proof-doc: docs/COMMANDS_AND_UX.md
- AC-4: `docs/JUDGE.md` describes proof declarations, the clarification signal and the rounds
  report, consistent with the shipped `.akrctx/judge/README.md`.
  proof-doc: docs/JUDGE.md
- AC-5: CHANGELOG.md has a `[0.7.0] - <date>` section holding the released entries, and an empty
  `[Unreleased]` section above it.
  proof-doc: CHANGELOG.md
- AC-6: `src/version.ts` and `package.json` both read 0.7.0, and `akrctx --version` reports 0.7.0.
  proof-command: pnpm build
- AC-7: Any generated file or manifest that depends on the version was regenerated through the
  CLI, and `akrctx upgrade --dry-run` reports that the upgrade can complete.
- AC-8: Every Validation command passes.
  proof-command: pnpm test
  proof-command: pnpm lint
  proof-command: pnpm akrctx doctor --json
- AC-9: No tag, push or feature code change is part of the candidate. The final report gives the
  human the exact tag command.
- AC-10: Existing agent instruction files are preserved unless a human approves a merge.
- AC-11: The review checklist is completed before snapshot capture.
  proof-doc: .akrctx/tasks/TASK-085-release-0-7-0/review-checklist.md
