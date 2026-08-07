# Context

## Relevant Files

- `src/fs-utils.ts` — `writePlannedFile`, which decides `create` / `update` / `preserve` /
  `suggest`. Its forced branch currently reports `update` unconditionally with the reason
  "Updated because --force was provided."
- `src/impl.ts`, `src/judge.ts`, `src/comprehension.ts` — the three enable commands, which
  pass `options.force` straight through for the agent files.
- `src/cli.ts` — every site that prints `writes`, including `printGroupedWrites` used by
  `init`, and the init next-steps text.
- `src/format.ts` — the marker helpers. It has `plus`, `warn`, and `minus` but nothing for
  an update or a preserved file.
- `tests/agents.test.ts` — the agent suites, including the upgrade-regeneration test that
  covered the path that worked while the broken one went untested.

## Prior Findings

- Confirmed by reproduction: after `impl enable`, `config set agents.implementer.model.copilot`,
  `impl enable` returns `kind: "preserve"`, `reason: "Existing file preserved."` and the
  frontmatter has no `model:` line. `impl enable --force` and `akrctx upgrade` both work.
- `writeManifest` already models the wanted behaviour: it compares content and returns
  `preserve` with "Managed-file provenance is already current." when nothing changed.
- `WriteKind` is `create | update | preserve | suggest | skip`.
- Agent files are in `isManifestManagedPath`, so `upgrade` regenerates them from
  configuration. That is the contract `enable` has to match.

## Blocked Reads

- Secrets and credentials must not be read.
