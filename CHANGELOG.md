# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-07-14

### Added

- Optional developer comprehension checkpoints for significant completed changes.
- Platform-native `akrctx-comprehension` agents for Codex, Claude Code, and GitHub Copilot, plus versioned scope, rubric, and result schemas.
- `akrctx comprehension enable|disable|status` commands.
- Git-ignored local storage for personal responses and assisted-learning records.
- Visual change maps, test matrices, one-question-at-a-time teaching, and structured learning reports.
- Post-initialization `akrctx templates apply` and `templates status` commands, including sequential multi-pack composition and local pack support.

### Changed

- Comprehension runs in a separate agent context instead of loading a skill into the implementing agent.
- The primary workflow now offers judge review first and hands only the exact code boundary and verdict to comprehension.
- Judge agents independently derive the review boundary, use read-only controls where supported, and emit structured review evidence.
- Deterministic `judge scope` and `judge verify` commands bind approvals to SHA-256 digests of the task capsule and exact code boundary, invalidating stale verdicts before comprehension.
- Safe upgrades now preserve wiki pages, task capsules, local records, and root instructions; generated files update only when their recorded manifest hash proves they are unchanged.
- Added `.akrctx/manifest.json`, versioned upgrade candidates, conservative legacy handling, field-level config/policy migration, and non-destructive obsolete-file reporting.
- Doctor agents may apply surgical protected-instruction merges only after showing the exact diff and receiving explicit human approval in the current conversation; `doctor --fix` no longer creates spurious merge suggestions during repair.
- Template application is independent from `init`, transactional for blocking conflicts, non-destructive for project content, and records pack versions, targets, and target-file hashes for upgrade provenance.

### Security

- Comprehension evaluators may inspect only in-scope, non-blocked Git data with read-only commands.
- Enabling fails when the local ignore contract is unsafe; `doctor --fix` repairs it.
- Personal records are preserved by `remove --all` unless `--purge-local` is explicit.

## [0.2.0] - 2026-07-04

Audit hardening release. Fixes critical and medium-severity bugs found in a
security/quality/DX audit, tightens security-relevant defaults, and cleans up
a few DX rough edges. See `docs/AUDIT-PLAN.md` for the full rationale behind
each change.

### Fixed — critical

- `akrctx doctor --fix` actually repairs the harness now: the CLI layer was
  dropping the `--fix` flag before it reached `runDoctor`, so `--fix` was a
  silent no-op from the command line.
- `selectWorkflow` no longer filters out the "UI review" task recommendation
  against `allowedWorkflows` — it's a task-level recommendation, not a
  selectable workflow default, so it always passes through.
- `akrctx compile` always regenerates the export brief. Previously a stale
  export was silently preserved without `--force` while the CLI still printed
  "Compiled: ...".
- `akrctx config show` and `config set` now distinguish a corrupt
  `.akrctx/config.json` (throws a clear error) from a missing one (suggests
  `akrctx init`) — previously both cases reported "not found", and following
  that advice on a corrupt config would have silently overwritten it.
- `akrctx doctor --ci` no longer fails when the installed harness version
  drifts from the current CLI version. Doctor suggestions are now structured
  `{ text, severity }` objects (`"error" | "warning" | "info"`), and `--ci`
  only fails on `severity: "error"`. **Breaking for JSON consumers:**
  `DoctorResult.suggestions` changed from `string[]` to `Suggestion[]`.

### Fixed — medium

- `doctor --fix` repairs every installed target, not just the first.
- `doctor --fix` only reports `.akrctx/config.json` / `.akrctx/policy.json`
  as "fixed" when the merge actually changed something.
- Wiki lint handles CRLF frontmatter and links with an anchor fragment
  (`file.md#anchor`) or a markdown title (`file.md "Title"`).
- `akrctx init` fails with a clear error instead of silently defaulting to
  `codex` when run non-interactively with no `--target` and no (or multiple)
  detected setups. **Breaking:** scripts relying on the old silent-fallback
  behavior must now pass an explicit `--target`.
- Task capsules (`listTasks`, `runStatus`) sort numerically by `TASK-XXX`
  instead of lexicographically (`TASK-010` no longer sorts before `TASK-002`).
- `judge enable --dry-run` prints "would enable (dry-run)" instead of
  claiming the judge was enabled; `runJudgeStatus` no longer scans the
  filesystem twice.
- `akrctx remove` dry-run preview now matches what `--force` actually does,
  including directories that would be pruned once empty. Clarified
  `--target all` (files for every target) vs `--all` (also removes
  `.akrctx/`) in the command's help text.

### Security

- Documented in `README.md` that `policy.json`, `blockedReadPatterns`, and
  `protectedFiles` are prompt-level/convention controls, not technical
  enforcement — they do not resist prompt injection or a malicious agent.
- `akrctx init` now warns (`InitResult.policyWarnings`) when a template pack
  weakens enforcement (changes `mergeStrategy` or flips an `enforcement.*`
  flag from `true` to `false`). It does not block the pack — some enterprise
  packs relax enforcement on purpose — it just makes the change visible.
- `akrctx remove --all` no longer deletes task capsules under
  `.akrctx/tasks/`. **Breaking:** if you relied on `--all` fully wiping
  `.akrctx/`, pass the new `--purge-tasks` flag alongside it.

### Changed — DX

- `akrctx upgrade` flags akrctx-owned files whose content differs from the
  current template with `reason: "overwritten (had local modifications)"`
  and lists them in a "review with git diff" warning. There is no stored
  hash of the previous template version, so this can't distinguish a
  genuine local edit from an old template version — commit before upgrading.
- Removed the leftover "tetris" keyword from workflow recommendation and
  reordered precedence so bug/test signals (TDD) are checked before domain
  keywords (SDD) — "fix the api bug" now recommends TDD instead of SDD.
- `akrctx init` writes `.akrctx/targets/<t>.md` only for the selected
  target(s) instead of all four; `akrctx doctor` requires it only for
  installed targets.
- Deduplicated the `task create <description>` / `task <description>`
  handlers in the CLI (no behavior change).
- `judge enable` no longer accepts a `--target` flag it never used.
- `akrctx doctor`'s readiness score is now weighted by issue category
  instead of a flat per-item penalty: missing harness file (-5, cap 40),
  config/policy gap (-3, cap 20), wiki-lint issue (-1, cap 10), conflict
  (-10, cap 40), no target installed (-25). Wiki-lint issues no longer
  appear in `DoctorResult.missing` (they're `warning`-severity suggestions
  instead), so they no longer fail `doctor --ci`.

### Added

- `akrctx config set allowedWorkflows` to restrict which workflows the CLI and agent may use.
- Task workflow selection now validates against `defaults.allowedWorkflows`:
  - Explicit `--workflow` values outside the allowed list are rejected.
  - A configured `defaultWorkflow` outside the allowed list is rejected as a misconfiguration.
  - When `task-fit` recommends a disallowed workflow, the CLI falls back to the first allowed workflow and records the reason in the task capsule.
- Task management subcommands: `akrctx task list`, `akrctx task show TASK-001`, `akrctx task rm TASK-001`.
- `akrctx doctor --fix` to automatically recreate missing harness files and repair config/policy gaps.
- `akrctx compile --target all` to compile a brief for every installed target at once.
- Documentation for `allowedWorkflows` and the new commands in `docs/CONFIGURATION.md`, `docs/COMMANDS_AND_UX.md`, and `README.md`.
- `CHANGELOG.md` and versioning/release process in `docs/RELEASE_CHECKLIST.md`.
- OKF-style YAML frontmatter on every `.akrctx/wiki/` page (`type`, `title`, `description`, `tags`, `timestamp`).
- `akrctx doctor` now writes `.akrctx/wiki/gaps.md` and `.akrctx/wiki/recommendations.md` alongside `.akrctx/wiki/agent-setup.md`.
- New `.akrctx/wiki/index.md` catalog with bundle-relative links to all wiki pages.
- `.akrctx/wiki/log.md` now uses ISO-date headings.
- Wiki lint integrated into `akrctx doctor`: reports broken links, orphan pages, and missing or invalid frontmatter timestamps.
- Doctor and write-policy skills now instruct agents to keep the wiki alive by recording architecture, conventions, testing commands, and decisions as they are discovered.
- `.akrctx/wiki/write-policy.md` recommends bundle-relative links (`/wiki/decisions.md`) for cross-page references.
- `DoctorResult` exposes a new `wikiLint` field, included in `akrctx doctor --json` output.
