---
type: akrctx-wiki-testing
title: "Testing"
description: "Build, test, lint, and validation commands for the project."
tags: ["testing"]
timestamp: 2026-07-22T18:45:00.000Z
---

# Testing

Run from the repository root. pnpm is the pinned package manager (`packageManager: pnpm@10.5.2`); Node >= 20.

| Command | Purpose | Verified 2026-07-22 |
|---|---|---|
| `pnpm build` | tsup ESM build + d.ts into `dist/`. `pnpm prepare` runs it. | pass |
| `pnpm test` | `vitest run` — 2 files, 186 tests, ~3.4s. | pass |
| `pnpm lint` | `biome check .` (format + lint + import order). | pass — 39 files |
| `pnpm lint:fix` | `biome check --write .` | pass |
| `pnpm akrctx <args>` | Runs the built CLI from `dist/`. Requires a prior `pnpm build`. | pass |

## Proving a change worked

- Behavior change in a command module: `pnpm test` alone is enough — the suite drives `run*` functions against a fresh temp dir per test.
- Change to generated content in `src/templates/`: `pnpm build && pnpm akrctx init --target codex --dry-run` prints the planned writes without touching the tree.
- Change to doctor scoring or the file inventory: `pnpm build && pnpm akrctx doctor --json`.

## Why `biome.json` ignores `.akrctx/`

`.akrctx/**` is generated harness output, not project source. Biome used to lint it and reported 6 formatter errors in the dogfooded JSON (`config.json`, `policy.json`, the judge and comprehension schemas), because it collapses their multi-line arrays onto one line at `lineWidth: 120`.

Formatting those files is the wrong fix: it rewrites installed harness files and desynchronizes them from the sha256 hashes in `.akrctx/manifest.json`, and the next `init`/`upgrade` would rewrite them back from `src/templates/` anyway. So `.akrctx/` is ignored alongside `dist/`, for the same reason. The generating templates in `src/templates/` are still linted.

## Test conventions

Both suites `mkdtemp` a directory in `beforeEach` and remove it in `afterEach`. `tests/cli.test.ts` additionally `process.chdir()`s into the temp dir and spies on `console.log`/`console.warn`; `tests/akrctx.test.ts` passes `cwd` explicitly instead. Prefer the explicit-`cwd` style for new tests — it keeps cases parallel-safe.
