# Context

## Relevant Files

- `src/types.ts` — declares `akrctxConfig` (line 104) and `akrctxPolicy` (line 136).
- `src/manifest.ts` — declares `akrctxManifest` (line 13). Renamed first because it has the fewest
  references.
- Every file referencing one of the three. Enumerated by
  `grep -rln "\bakrctxConfig\b\|\bakrctxPolicy\b\|\bakrctxManifest\b" src`, not listed here, because
  a stale list is worse than no list.
- `package.json` — the reason this is not a breaking change. No `main`, no `exports`, no `types`;
  only `bin`. Confirm before starting.
- `src/index.ts` — the package entry point. It is a CLI bootstrap with a shebang and re-exports
  nothing, which is why `dist/index.d.ts` is empty of types.

## Prior Findings

- Reference counts measured on this commit: `akrctxConfig` 42, `akrctxPolicy` 13,
  `akrctxManifest` 7. All of them inside `src/`.
- Zero references in `tests/`, `evals/` (excluding `.cache/`), `docs/`, `README.md` or
  `TUTORIAL.md`. The two test files that import from `src/types.js` take `targets` and `workflows`,
  which are values, not these interfaces.
- `dist/index.d.ts` contains one line: the shebang. Nothing typed is published.
- Hits under `evals/.cache/builds/*/source/` are checked-out copies of older commits used by the
  evaluator's build cache. They are not call sites and must not be edited.
- This capsule was split from TASK-028 during capsule review, so that four dead-export deletions
  could be reviewed on their own.

## Blocked Reads

- Secrets and credentials must not be read: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`,
  `secrets/`, `credentials/`, `private/`.
- `.akrctx/local/judge/snapshots/` holds full copies of earlier worktrees. `src/*.ts` under a
  snapshot path is an old revision and must not be renamed.
