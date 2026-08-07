# Implementation log — TASK-014

## 2026-08-07

- Resolved the Open Question with Option A: commit the config-required dogfooded agent
  files into git rather than teaching doctor to tolerate gitignored missing files.
- Updated `.gitignore` to ignore `.codex/*` except `.codex/agents/`, so the codex agent
  files required by `.akrctx/config.json` are part of the checkout.
- Removed the stale `.codex/agents/akrctx-comprehension.toml`; the comprehension agent is
  disabled in config, so it is not part of the required set and should not be tracked.
- Added `tests/dogfood.test.ts` asserting that every agent file required by the current
  `.akrctx/config.json` is tracked by `git ls-files`.
- Staged and committed the changes.
- Validation results:
  - `git archive HEAD | tar -x -C /tmp/fresh-clone` + `pnpm install --frozen-lockfile` +
    `pnpm build` + `node dist/index.js doctor --json` → readiness 100, no errors.
  - `pnpm build && pnpm test && pnpm lint` → 698 tests passed, lint clean.
  - `pnpm akrctx init --target codex --dry-run` → no unexpected changes.
  - `pnpm akrctx upgrade --target codex` → preserves `.codex/agents/akrctx-judge.toml`;
    manifest hash remains correct.
