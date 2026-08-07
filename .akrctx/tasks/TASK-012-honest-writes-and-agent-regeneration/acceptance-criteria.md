# Acceptance Criteria

## 1 — enable regenerates the agent file

- After `impl enable`, setting `agents.implementer.model.<target>`, and running
  `impl enable` again with no flags, the generated file carries the new model.
- The same holds for `judge enable` and `comprehension enable`.
- A second `enable` with nothing changed reports the file as unchanged, not as an update,
  and leaves its content byte-identical.
- `--dry-run` still writes nothing.
- A file that is protected by policy is still never overwritten. Agent files are managed,
  not protected, and this task does not move any file across that line.

## 2 — writes print what actually happened

- Each printed write reflects its `kind`: a created file, an updated file, a preserved file,
  and a suggested file are visually distinct.
- A `preserve` is never rendered with the marker used for a creation.
- The counts and grouping in `init` output remain correct.
- `--json` output is unchanged, so scripts that read `writes[].kind` keep working.

## 3 — the implementer is discoverable

- `akrctx init` names `akrctx impl enable` wherever it names `akrctx judge enable` and
  `akrctx comprehension enable`.

## 4 — the CHANGELOG records the doctor threshold change

- The Unreleased section states that a doctor agent gap now fires when any expected agent
  file is missing, where the check it replaced fired only when all of them were.

## Cross-cutting

- `pnpm build && npx vitest run` passes in full.
- `npx tsc --noEmit` adds no new error.
- A test covers the sequence that failed in QA: enable, change the model, enable again.
