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

- None.

## Open Questions

- None.
