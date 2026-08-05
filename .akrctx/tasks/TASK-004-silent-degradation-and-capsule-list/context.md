# Context

## Relevant Files To Inspect

### (a) corrupt config degrades silently

- `src/config.ts:26-34` — `readConfig`, returns `undefined` on any parse failure.
- `src/config.ts:42-52` — `readConfigStrict`, already has the correct semantics.
- `src/task.ts:46-47,148` — `runTask` → `selectWorkflow`, where `config === undefined`
  becomes `allowed = [...workflows]`.
- Lenient callers to reclassify: `src/compile.ts:69`, `src/doctor.ts:83`,
  `src/judge.ts:41,89,102`, `src/status.ts:22`, `src/task.ts:46`.
- Strict callers already correct: `src/cli.ts:268`, `src/comprehension.ts:65,116,125`,
  `src/template-apply.ts:44,108`, `src/upgrade.ts:67`, `src/config.ts:154`.

### (b) invented target

- `src/config.ts:61-90` — `normalizeConfig`; line 64 returns `defaultConfig(["codex"])`
  for a non-object, line 69/74 substitutes `["codex"]` when no target parses.
- `src/templates/defaults.ts:9-53` — `defaultConfig`; `defaults.target = targets[0]`,
  so an empty target list would produce `undefined` where a `Target` is typed.
- `src/doctor.ts:334-358` — `getConfigGaps` parses raw JSON directly, so it does not go
  through `normalizeConfig` and will not crash. It has no targets check today.

### (d) three capsule file lists

- `src/harness-files.ts:27-30` — `neutralRequired`, four `_template` entries.
- `src/judge-enforcement.ts:10` — `taskFiles`, five entries; `createJudgeScope` at
  `:101-112` throws `Task capsule file is missing` for any absent one.
- `src/task.ts:59-67` — `runTask` writes five plus `exports/README.md`.
- `src/task.ts:334` — `showTask` repeats the five-entry list.
- `src/templates/wiki.ts:243-252` — `taskTemplateFiles`, four entries, no
  `acceptance-criteria.md`.
- `src/upgrade.ts:271-328` — `preserveProjectKnowledge` creates missing task-template
  files without overwriting existing ones, so it covers AC10 once the list grows.

## Tests To Update Or Add

- `tests/akrctx.test.ts:1148-1164` — pins the current `readConfig` / `readConfigStrict`
  split. AC12 says update, not delete.
- `tests/akrctx.test.ts:262-290` — profile tests use `readConfig` on healthy configs;
  they should keep passing unchanged and act as the regression guard.

## Confirmed On Disk

- `.akrctx/tasks/_template/` contains `context.md`, `plan.md`, `review-checklist.md`,
  `task.md`. `acceptance-criteria.md` is absent, which is defect (d).
- Nothing in `src/` reads `policy.enforcement.*` or `config.defaults.require*` to
  enforce anything; only `doctor` checks that the keys exist. Out of scope here,
  recorded because it motivates the wider plan.

## Blocked Reads

- .env
- .env.*
- *.pem
- *.key
- *.p12
- *.pfx
- secrets/
- credentials/
- private/
