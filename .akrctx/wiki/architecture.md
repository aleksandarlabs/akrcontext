---
type: akrctx-wiki-architecture
title: "Architecture"
description: "Project architecture discovered by the agent."
tags: ["architecture"]
timestamp: 2026-08-05T21:08:00.000Z
---

# Architecture

This repository is the **source of the akrctx CLI**, not a project consuming it. `.akrctx/`, `CLAUDE.md`, `.claude/`, and `AGENTS.md` at the root are a dogfooded install of the tool's own output — changing them does not change what the tool ships. Shipped content lives in `src/templates/`.

## Layering

`src/index.ts` (bin shim) → `src/cli.ts` (Commander wiring, all user-facing help text) → one command module per verb → `src/templates/*` for every byte written into a target project.

Command modules are pure-ish: each exports a `run*` function taking `CommandOptions` (with `cwd`), so tests drive them against a temp directory instead of the process CWD.

## Module map

| File | Role |
|---|---|
| `src/cli.ts` | Command wiring (Commander.js). All user-facing help text lives here. |
| `src/index.ts` | `#!/usr/bin/env node` shim; maps thrown errors to `process.exitCode = 1`. |
| `src/init.ts` | Harness installation: detects targets, writes files, handles conflicts. |
| `src/doctor.ts` | Deterministic audit: checks installed files, scores readiness, regenerates wiki reports. |
| `src/upgrade.ts` | Re-writes harness files when `installedVersion` lags `CLI_VERSION`. |
| `src/task.ts` | Task capsule generation and workflow recommendation from description keywords. |
| `src/compile.ts` | Compiles a task capsule into a single agent-ready brief. |
| `src/config.ts` | Reads and mutates `.akrctx/config.json` in the target project. |
| `src/status.ts` | Quick install summary. |
| `src/remove.ts` | Removes harness files for a target. |
| `src/detect.ts` | Detects which agent targets exist in a project (Codex, Claude, Copilot, Pi). |
| `src/harness-files.ts` | `neutralRequired` / `targetRequired` / `protectedFiles` — the file inventory doctor, init, upgrade, and remove all agree on. |
| `src/manifest.ts` | `.akrctx/manifest.json`: sha256 per installed file, used to tell tool-written files from user edits. |
| `src/template-pack.ts`, `src/template-apply.ts` | Bundled template packs under `templates/`, and applying them post-init. |
| `src/judge.ts`, `src/judge-enforcement.ts` | Optional judge subagent: enable/disable/status, plus scope creation and record verification. |
| `src/judge-snapshot.ts` | Immutable local review snapshots, integrity checks, current-state classification, and catch-up chains. |
| `src/comprehension.ts` | Optional comprehension gate and its local-only storage guarantees. |
| `src/wiki-lint.ts` | Wiki link/orphan/timestamp linting, surfaced by doctor as warnings rather than errors. |
| `src/fs-utils.ts` | File system helpers (`pathExists`, `safeWrite`, …). |
| `src/format.ts` | Terminal output formatting (colors, bold, rule lines). |
| `src/version.ts` | Single source of truth for the CLI version (`CLI_VERSION`). |
| `src/types.ts` | All types: `Workflow`, `Target`, `TaskWorkflow`, `akrctxConfig`, … |
| `src/templates/instructions.ts` | **Single source of truth** for generated skill text, instruction files, and prompts. |
| `src/templates/defaults.ts` | Default `config.json` and `policy.json` content. |
| `src/templates/wiki.ts` | Wiki file templates installed under `.akrctx/wiki/`. |
| `src/templates/judge*.ts`, `src/templates/comprehension*.ts` | Judge contract and comprehension agent/gate templates. |
| `src/templates.ts` | Barrel re-exporting `src/templates/*`. |
| `tests/akrctx.test.ts` | Main suite, driving the `run*` functions directly (~310 cases). |
| `tests/cli.test.ts` | Thin suite driving `main(argv)` end to end (~7 cases). |

## Single-source-of-truth rules

- `src/version.ts` owns `CLI_VERSION`; `cli.ts`, `templates/defaults.ts`, and `doctor.ts` import it. Bump it there only.
- `src/harness-files.ts` owns which files a target requires. Adding a generated file means editing that list, or doctor will never notice it is missing.
- `src/templates/instructions.ts` is content other repos read. Edits there change every downstream project's agent behavior on `akrctx upgrade`.

## Judge boundary model

`WORKTREE` remains a strict compatibility boundary: any live edit invalidates its review.
The normal concurrent-development path captures `SNAPSHOT:<id>` below the ignored
`.akrctx/local/judge/snapshots/` directory. Capture creates a shallow private repository
with the candidate and base commits, overlays allowed tracked and untracked changes,
removes blocked paths from the reviewable worktree, copies local Node dependencies rather
than linking them, and compares the complete allowed-content manifest before publishing.
It does not change the source repository's branch, refs, index, stash, history, or files.

Approval validity and live applicability are separate. Verification binds an approval
to the immutable snapshot and re-runs declared validation in a disposable copy outside
the project. `judge current` validates the record before reporting whether the live
workspace is `CURRENT`, has `NEWER_CHANGES`, or has `DIVERGED`; a catch-up snapshot binds
only the delta after strong parent verification and recursively preserves its ancestry.
`judge prune` is the explicit dry-run-first retention boundary.

## Known sharp edge

`getInstalledTargets()` (`src/doctor.ts:316`) infers installed targets from file presence via `targetRequired`, ignoring the `targets` array in `.akrctx/config.json`. Because `AGENTS.md` is the first entry of `targetRequired.codex`, any repo with a hand-written `AGENTS.md` is reported as a Codex install. See [Gaps](/wiki/gaps.md).
