# Review Checklist

## The full list was established first

- [ ] `log.md` contains the complete table of template pack references across `README.md`, `docs/`,
      `src/` and `templates/`.
- [ ] All four known locations are addressed: `README.md:214-215`,
      `docs/COMMANDS_AND_UX.md:105,107`, `src/cli/templates.ts:41,43`,
      `docs/CONFIGURATION.md:150`.
- [ ] A search for `company-base` and `security-rules` returns only intended hits. Each remaining
      hit is named in task.md with its reason.
- [ ] `docs/ENTERPRISE.md:111,117,169` still correct after the change.

## The direction was chosen, not defaulted

- [ ] The chosen option is recorded under `## Clarifications` with the reasoning.
- [ ] If the docs now point at `test-template`, the name question was faced: either the pack was
      renamed, or the docs say plainly it is an example pack for trying the command.
- [ ] `docs/CONFIGURATION.md:150` was handled explicitly. If an illustrative name stays, the
      surrounding text makes clear the reader supplies the pack.
- [ ] If packs were created, each is real: `loadBundledTemplatePack` accepts it, it has an
      `akrctx-pack.json` matching the existing shape, and it ships in the published package.

## The examples were executed, not read

- [ ] Every documented command was copied verbatim into a scratch repository and run.
- [ ] `log.md` contains the transcript, including the real output.
- [ ] `akrctx templates --help` output was executed too, not only inspected.

## It cannot break silently again

- [ ] A guard test asserts every pack name in docs and help text exists under `templates/`.
- [ ] The `loadBundledTemplatePack` failure message names the packs that do exist. Test present.

## Validation

- [ ] `pnpm lint && pnpm build && npx vitest run` passes, output recorded verbatim in `log.md`.
- [ ] `pnpm lint` reports zero errors and zero warnings.
- [ ] No test skipped to make the suite green.
- [ ] No Biome rule disabled, inline-ignored, or downgraded to reach a clean run.
- [ ] `CHANGELOG.md` purely additive, continuations indented two spaces. A pack rename is recorded
      as a breaking change.
