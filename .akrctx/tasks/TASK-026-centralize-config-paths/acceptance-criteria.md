# Acceptance Criteria

## Only path construction is centralized

- AC-1: The distinction is load-bearing and must be applied before any edit: in `src/doctor.ts` most
  `.akrctx/policy.json` and `.akrctx/config.json` occurrences are inside **user-facing gap message
  strings** (lines 259-295, 312, 361-379), not path building. Replacing those with a constant
  changes nothing structural and risks changing the message text.
- AC-2: Only occurrences passed to `path.join` or otherwise used to reach the filesystem are replaced.
  Message strings keep their literal text.
- AC-3: A test asserts the doctor gap messages are byte-identical to before. The existing snapshot tests
  under `tests/__snapshots__` cover part of this; if they do not cover the gap text, a test is
  added that does.

## The constants exist and are the single source

- AC-4: `src/config.ts` exports the path constants. `configPath` at line 21 stops being module-private.
- AC-5: The consuming modules import them: `doctor.ts:59,202,350`, `status.ts`, `task.ts`,
  `judge-enforcement.ts`, `judge-snapshot.ts`, `template-apply.ts`, `upgrade.ts`.
- AC-6: After the change, `grep -rn '"\.akrctx/' src` shows the constant definitions and message strings
  only. Every remaining hit is deliberate, and task.md lists which ones and why.
- AC-7: `src/manifest.ts:7` already exports `manifestPath` with the same shape. Either it moves next to
  the new constants or task.md records why two locations are correct. Two conventions for the same
  thing is the problem this task exists to remove.

## No import cycle is created

- AC-8: `config.ts` must not import from the modules that will now import it. `pnpm build` passes and
  the CLI starts.
- AC-9: If a cycle appears, the constants move to a leaf module with no imports rather than being worked
  around with a dynamic import. A dynamic import to dodge a cycle is what
  `judge-snapshot.ts:754` already does, and this task should not add a second instance.

## Nothing behavioural moved

- AC-10: This is a pure refactor. No file is read from a different location, no message changes, no CLI
  output changes.
- AC-11: `pnpm test` passes with no test modified. If a test needed changing, the refactor was not pure
  and task.md says what changed and why.
- AC-12: `tests/dogfood.test.ts` still passes. It checks the repository's own install, so it fails loudly
  if a path constant is wrong.

## Ordering against neighbouring tasks

- AC-13: This task touches the same files as TASK-029, TASK-033, TASK-034 and TASK-035. Its position in
  the sequence is recorded in task.md before implementation, so the four are not implemented in
  parallel against the same lines.

## Validation

- AC-14: `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- AC-15: `pnpm lint` reports zero errors and zero warnings.
- AC-16: `CHANGELOG.md` records the refactor under the unreleased section, additive only, continuations
  indented two spaces.
