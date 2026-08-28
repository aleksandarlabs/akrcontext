# Task

## Goal

Conservar evidencia literal suficiente cuando una validación falla antes de solicitar una
repetición con más permisos o atribuir el fallo al sandbox.

Durante el catch-up de TASK-047 se informó de que `pnpm install --frozen-lockfile` había
fallado y después se concluyó que la causa era la resolución bloqueada por el sandbox. El
relato explica la recuperación, pero no conserva en el handoff el exit code ni la salida que
permite verificar esa causalidad.

Los workflows de snapshot y verify deben registrar el comando, exit code y un extracto
acotado de stderr/stdout antes de una escalada. El agente puede clasificar la causa como
confirmada o inferida, pero no presentar una inferencia como hecho.

## Validation

```
pnpm vitest run tests/akrctx.test.ts tests/agent-templates.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Persistir secretos, tokens, URLs privadas o variables de entorno.
- Guardar salidas ilimitadas de procesos.
- Autorizar automáticamente ejecución externa o acceso de red.
- Convertir heurísticas de errores de red/sandbox en certeza.

## Clarifications

### Session 2026-08-27

- Una aclaración anterior exploró un historial runtime local append-only y una secuencia entre
  invocaciones; queda supersedida por la decisión de alcance que sigue y no forma parte del
  contrato final.
- La decisión más reciente reduce el alcance: se retira el historial JSONL y cualquier promesa de
  secuencia entre invocaciones. Solo se registra la evidencia acotada y redactada del fallo de la
  ejecución actual; la causalidad es opcional y solo puede tener certeza `inferred` o `confirmed`.
- El usuario cerró TASK-055 sin más reintentos del Judge: dos revisiones independientes consecutivas
  terminaron `BLOCKED` por la misma denegación de `mktemp` en el sandbox del subagente, no por un
  defecto nuevo de la implementación. El conflicto del entorno se investigará fuera de esta tarea.

## Open Questions

- None.
