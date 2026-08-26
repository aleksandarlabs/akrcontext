# Context

## Relevant Files

- `src/judge-snapshot.ts` — captura y carga snapshots inmutables.
- `src/judge-enforcement.ts` — calcula scope y verifica records.
- `src/git.ts` — resolución de refs y commits.
- `tests/akrctx.test.ts` — cobertura de snapshot y `verify --run-tests`.
- `docs/JUDGE.md` — contrato del operador para bases y snapshots.

## Observed Failure

- Captura: `judge snapshot TASK-048 --base origin/main`.
- Revisión: APPROVED y seis comandos pasados.
- Verificación fuerte: comandos reejecutados, seguida de INVALID porque la copia desechable
  no podía resolver `origin/main` al recomputar la frontera.
- Workaround confirmado: capturar con el hash completo del mismo commit base.

## Constraints

- El hash debe resolverse antes de construir la frontera y quedar ligado al snapshot.
- Una etiqueta humana puede conservarse solo como metadata diagnóstica; nunca puede ser
  necesaria para verificar.
- No deben mutarse refs, branches ni el worktree vivo.
