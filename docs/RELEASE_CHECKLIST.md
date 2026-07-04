# Release Checklist

akrctx v0.1 is source-repo installable. It is not published to npm yet.

## Versioning

This project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- While the major version is `0`, minor bumps (`0.x.0`) indicate new features and patch bumps (`0.0.x`) indicate bug fixes.
- `src/version.ts` is the single source of truth for the CLI version. `package.json` should match it at release time.

During development, keep changes under the `[Unreleased]` section of `CHANGELOG.md`. Do not bump `version.ts` or `package.json` until a release is prepared.

## Release Process

1. Ensure `CHANGELOG.md` accurately describes all changes under `[Unreleased]`.
2. Rename `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`.
3. Update `src/version.ts` to the new version.
4. Update `package.json` to the same version.
5. Run the checks below.
6. Commit and tag: `git tag -a vX.Y.Z -m "Release vX.Y.Z"`.

## Before Tagging

```bash
pnpm install
pnpm build
pnpm test
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
pnpm akrctx config show
pnpm akrctx task "Define invoice API examples" --workflow SDD+EDD --dry-run --json
```

## Changelog

Every notable change should be added to `CHANGELOG.md` under `[Unreleased]` as part of the PR that introduces it. Use the categories `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, and `Security` as defined by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Manual Checks

- README explains source-repo installation.
- `docs/INSTALLATION.md` is current.
- `docs/CONFIGURATION.md` documents config defaults.
- `docs/WORKFLOWS.md` documents workflow selection.
- Existing instruction files are preserved in init tests.
- `.gitignore` excludes dependencies, build output, secrets, and local artifacts.

## Not In v0.1

- npm publishing.
- LLM API integrations.
- Telemetry.
- Web app.
- External agent execution.

These non-goals describe the akrctx CLI, not the programming agent after a harness is installed.
