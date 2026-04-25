# Release Checklist

akrctx v0.1 is source-repo installable. It is not published to npm yet.

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
