# Acceptance Criteria

## Every broken location is fixed, not only the two named in task.md

- task.md names the README and `--help`. The full list of places referencing packs that do not
  exist is:
  - `README.md:214-215` — `company-base`, `security-rules`
  - `docs/COMMANDS_AND_UX.md:105,107` — `company-base`, `security-rules`
  - `src/cli/templates.ts:41,43` — `company-base`, `security-rules`
  - `docs/CONFIGURATION.md:150` — `company-base` inside a config example
- All four are addressed. A search for `company-base` and `security-rules` after the change returns
  only intended hits, and any remaining hit is named in task.md with its reason.
- `docs/CONFIGURATION.md:150` is a config sample, not a runnable command. Whether an illustrative
  name is acceptable there is decided rather than assumed; if it stays, the surrounding text makes
  clear the pack is an example the reader supplies.

## The direction: rename the one real pack, invent nothing

- `company-base` and `security-rules` are **not created**. Every reference to them is removed from
  documentation and help text.
- `templates/test-template/` is renamed to a name a user would plausibly want, and the new name is
  recorded in task.md before the rename lands.
- The rename is complete: directory name, the `name` field in `akrctx-pack.json`, and every
  reference in `README.md`, `docs/COMMANDS_AND_UX.md`, `docs/CONFIGURATION.md`,
  `docs/ENTERPRISE.md` and `src/cli/templates.ts`.
- `docs/ENTERPRISE.md:111,117,169` currently use `test-template` correctly and **break** under the
  rename. They are the locations most likely to be missed and are checked by name.
- The pack still loads: `loadBundledTemplatePack` accepts it under the new name, and it still ships
  through the `templates` entry in the root `package.json` `files` array. Verified by inspecting
  `pnpm pack` output, not by reading the array.
- `CHANGELOG.md` records the rename as a **breaking change** for anyone scripting the old name.

## The examples are executed, not read

- Every command shown in `README.md`, `docs/COMMANDS_AND_UX.md`, `docs/ENTERPRISE.md` and
  `akrctx templates --help` is copied verbatim into a scratch repository and run. The transcript
  goes into `log.md`.
- A test walks the documented example commands and asserts each resolves, so this cannot silently
  break again. If a full execution test is too heavy, the test at least asserts every pack name
  appearing in docs and help text exists under `templates/`.
- `docs/ENTERPRISE.md:111,117,169` already use `test-template` correctly. They must stay correct
  after whichever direction is chosen — a rename breaks them.

## The failure is legible if it happens anyway

- `loadBundledTemplatePack` failing on an unknown pack names the packs that do exist. A user who
  mistypes a name should not have to read the source to find the right one.
- A test covers that message.

## Validation

- `pnpm lint && pnpm build && npx vitest run` passes with no new failures and no skipped tests.
- `pnpm lint` reports zero errors and zero warnings.
- `log.md` records every documented example command and its real output.
- `CHANGELOG.md` records the fix under the unreleased section, additive only, continuations
  indented two spaces. If a pack is renamed, that is a breaking change for anyone scripting it and
  is recorded as such.
