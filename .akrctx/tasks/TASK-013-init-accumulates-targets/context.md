# Context

## Relevant Files

- `src/init.ts` — `runInit`. Line 59 builds a fresh config from `defaultConfig`, line 61
  assigns `config.targets`, line 62 assigns `config.defaults.target`, and the write goes
  through the local `writeFile` helper which passes `options.force`.
- `src/doctor.ts` — `runDoctor --fix` calls `runInit` once per installed target with
  `repair: true`, so any change to how init treats an existing config runs there too.
- `src/config.ts` — `normalizeConfig`, which the merged config must still pass through.
- `src/templates/defaults.ts` — `defaultConfig(targets, profile)`.

## Prior Findings

- Reproduced: after `init --target copilot` then `init --target claude`, `config.targets` is
  still `["copilot"]` while ten claude files exist on disk.
- Two independent causes: the assignment is not a merge, and the config write is preserved
  on a second run because the file exists and `--force` is absent. Fixing only one leaves
  the bug.
- Doctor's installed targets come from disk detection, not from `config.targets`, which is
  why it reported "Setup is complete" for the contradictory state.
- TASK-012 made `writePlannedFile` report an unchanged forced write as `preserve`, so
  writing the config unconditionally does not produce a false "updated" line.

## Blocked Reads

- Secrets and credentials must not be read.
