# Context

## Relevant Files

- `CHANGELOG.md`: `[Unreleased]` section and style to follow.
- `docs/RELEASE_CHECKLIST.md`: release process and checks.
- `docs/COMMANDS_AND_UX.md`, `docs/JUDGE.md`: user docs to update.
- `src/version.ts`, `package.json`: version sources.
- `.akrctx/judge/README.md`: shipped judge contract; the docs must agree with it.
- `.akrctx/tasks/TASK-076-*` to `TASK-084-*`: confirmed contracts and Clarifications.

## Blocked Reads

- Secrets and credentials must not be read.
