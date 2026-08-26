# Task

## Goal

Impedir que una revisión presentada como TASK-XXX incluya silenciosamente cápsulas de otras
tareas presentes en el mismo worktree.

El snapshot inicial de TASK-047 incluyó los cinco archivos de TASK-048, TASK-049 y TASK-050.
El judge recibió instrucciones para revisar TASK-047, pero su frontera contenía otros quince
documentos. El digest fue íntegro, pero la intención y el scope comunicado no coincidían.

`judge scope` y `judge snapshot` deben fallar por defecto cuando detecten cambios bajo
`.akrctx/tasks/TASK-YYY-*` con un ID distinto del solicitado. Una inclusión intencional debe
ser explícita, visible en la salida y ligada al scope.

## Validation

```
pnpm vitest run tests/akrctx.test.ts tests/cli.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Inferir automáticamente todos los archivos fuente permitidos para una tarea.
- Ocultar cambios del worktree al digest.
- Crear commits, branches o worktrees por el usuario.
- Permitir una cápsula extranjera mediante una confirmación implícita.

## Clarifications

- None.

## Open Questions

- None.
