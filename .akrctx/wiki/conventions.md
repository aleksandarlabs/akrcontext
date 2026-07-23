---
type: akrctx-wiki-conventions
title: "Conventions"
description: "Coding, naming, and review conventions discovered by the agent."
tags: ["conventions"]
timestamp: 2026-07-22T18:45:00.000Z
---

# Conventions

Formatting is enforced by biome (`biome.json`) — 2-space indent, double quotes, semicolons, trailing commas, 120-column lines. Do not restate those rules in instruction files.

## Command modules

- One verb per module, exporting `run<Verb>(options: CommandOptions): Promise<XResult>`. `runJudgeEnable`, `runTemplateApply`, and `runComprehensionStatus` follow the same shape.
- Every `run*` resolves its working directory as `options.cwd ?? process.cwd()`. Never reach for `process.cwd()` deeper in a call chain — it is what makes the suite parallel-safe.
- `run*` returns a structured result object; it does not print. `src/cli.ts` owns all output, including the `--json` branch.
- Common flags are attached by the `addCommon()` helper in `src/cli.ts:73`: `--target`, `--dry-run`, `--force`, `--json`. New commands should use it rather than re-declaring options.

## Imports

- ESM with explicit `.js` extensions on relative imports (`./fs-utils.js`), even from TypeScript. Required by `"type": "module"`.
- Node built-ins use the `node:` prefix (`node:path`, `node:fs/promises`).
- `import type { … }` for type-only imports; biome's `organizeImports` fixes ordering.

## Errors

Command modules throw `Error` with a plain message. `src/index.ts` is the single catch site: it prefixes `akrctx: ` and sets `process.exitCode = 1`. Do not call `process.exit()` inside a command module.

## Comments

Sparse and explanatory — reserved for decisions the code cannot show, e.g. `src/doctor.ts:183` explaining why wiki-lint issues are warnings rather than CI-failing errors. Do not add comments that restate the statement below them.

## Generated content

Anything under `.claude/`, `.agents/`, `.github/skills/`, `.pi/`, or `.akrctx/` in this repo is tool output. Edit `src/templates/*` and re-run the CLI instead of hand-editing the installed copy; `.akrctx/manifest.json` tracks sha256 per file and hand edits desynchronize it.
