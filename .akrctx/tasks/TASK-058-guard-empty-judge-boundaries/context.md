# Context

## Relevant Files

- `src/judge-snapshot.ts` — publica snapshots y su resumen.
- `src/judge-enforcement.ts` — calcula `changedFiles` y scope.
- `src/cli/judge.ts` — flags y mensajes del comando.
- `tests/akrctx.test.ts` — contratos de snapshot.
- `tests/cli.test.ts` — salida y errores CLI.
- `docs/JUDGE.md` — guía para escoger base y candidato.

## Observed Failure

- La rama contenía la implementación en commits y el worktree estaba limpio.
- `judge snapshot TASK-048` tomó `HEAD` como base.
- La captura devolvió éxito con `changedFiles: []`.
- Solo una inspección posterior de `snapshot.json` reveló que no existía delta revisable.

## Constraints

- El comportamiento por defecto debe ser fail-closed.
- Una revisión deliberadamente vacía requiere un flag explícito y visible en metadata/salida.
- El fallo no debe dejar un snapshot parcial.
