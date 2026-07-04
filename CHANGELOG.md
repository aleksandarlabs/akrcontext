# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
