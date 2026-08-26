# Context

## Relevant Files

- `src/judge-enforcement.ts` — construye `changedFiles`, digests y scope.
- `src/judge-snapshot.ts` — captura y catch-up desde el scope.
- `src/cli/judge.ts` — flags, salida humana y JSON.
- `tests/akrctx.test.ts` y `tests/cli.test.ts` — contratos de scope/snapshot.
- `.akrctx/local/judge/TASK-047-a328907c6fd343c8e431.json` — evidencia local: incluye
  TASK-048/049/050 en una revisión de TASK-047.
- `docs/JUDGE.md` — contrato público de frontera completa.

## Boundary Rule

- El scope sigue incluyendo todos los cambios normales del worktree.
- La única exclusión implícita sigue siendo `blockedReadPatterns`.
- Cápsulas extranjeras no se excluyen: bloquean la captura salvo opt-in explícito, para que
  el usuario limpie/aisle el worktree o declare conscientemente la revisión conjunta.

## Blocked Reads

- No leer `.env`, claves, certificados, `secrets/`, `credentials/` ni `private/`.
