# Task

## Goal

`akrctx init --target <new>` in a repository that already has akrctx writes the new target's
files but never records the target, so the installation ends in a state where two parts of
the tool disagree about what is installed.

```
init --target copilot   →  config.targets: ["copilot"]
init --target claude    →  writes 10 claude files
                        →  config.targets: ["copilot"]     ← unchanged

akrctx doctor           →  "Installed: claude, copilot"    (detects from disk)
akrctx judge enable     →  "claude is not installed"       (reads config.targets)
```

Doctor reports 100/100 and "Setup is complete" for a repository whose agent commands refuse
to write files for a target the user explicitly installed.

Two causes compound. `src/init.ts` assigns `config.targets = selectedTargets` rather than
merging, and the config is written through `writePlannedFile` without force, so on a second
run the whole file is preserved and the assignment never reaches disk anyway.

Pre-existing: `src/init.ts` is untouched by the agents work on this branch. That work made
it visible, because the agents are the first subsystem to consume `config.targets` and to
say out loud when it disagrees with what the user asked for.

## Validation

```
pnpm build && npx vitest run
```

## Out Of Scope

- Removing a target. `akrctx remove --target <t>` already exists and owns that direction.
  This task never shrinks `targets`.
- Reconciling `config.targets` with disk detection anywhere other than through `init`.
  Doctor keeps reporting what it detects; this task removes the case where the two disagree
  after a normal install rather than adding a new reconciliation path.
- Changing which files `init` writes for a target, or the protected-file merge flow.

## Clarifications

### Session 2026-08-07

- A repeat `init` with a different target adds it to `targets` rather than replacing them.
  Replacing would orphan the previous target's files, which `init` does not delete, leaving
  disk and config disagreeing in the other direction. Adding is also what the command's own
  output already implies when it prints "Detected existing setup".
- `defaults.target` keeps its existing value on a repeat run. It answers "which target does
  a command assume when none is given", and a second install does not restate that
  preference. It is set only when there is no existing config.
- An existing config's other settings are preserved. Only `targets`, and `installedVersion`,
  may change on a repeat run; workflow defaults, profile, agents, and template packs are the
  user's and are not reset to defaults.
