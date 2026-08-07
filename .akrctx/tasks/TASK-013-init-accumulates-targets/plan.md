# Plan

## Workflow

TDD.

`workflowRules.bugfix` is `TDD`, and the reproduction is exact. The risk here is not the
merge itself but what a repeat `init` might trample on the way, so the preservation
criteria need tests that would fail loudly if the config were rebuilt from defaults.

## Steps

1. Write the failing test for the reported sequence: init copilot, init claude, assert both
   in `targets` and that `judge enable` writes both files.
2. Write the preservation tests: `defaults.target`, a user-set workflow default, and an
   unknown `agents` entry all survive a repeat init.
3. In `runInit`, read an existing config and use it as the base when present, unioning the
   selected targets into it; keep building from defaults when absent.
4. Write the config when it changed, relying on TASK-012's content comparison to report an
   unchanged run correctly.
5. Confirm `doctor --fix` still behaves, since it calls `runInit` once per detected target.
6. Run `pnpm build && npx vitest run` and `npx tsc --noEmit`, then fill the checklist.
