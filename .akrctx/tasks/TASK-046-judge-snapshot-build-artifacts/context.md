# Context

## Relevant Files

- `src/judge-snapshot.ts` — crea el worktree privado del snapshot y materializa sus
  dependencias.
- `src/judge-enforcement.ts` — reejecuta validación en una copia desechable del snapshot.
- `tests/akrctx.test.ts` — cobertura de captura, integridad y reejecución de snapshots.
- `package.json` — define `pnpm build` y `npm test`.

## Blocked Reads

- Secrets and credentials must not be read.
