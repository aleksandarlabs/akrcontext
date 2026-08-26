# Task

## Goal

Impedir que `judge snapshot` presente accidentalmente una frontera vacía como revisión útil
de una tarea implementada.

En TASK-048, ejecutar el comando por defecto después de hacer commit usó `HEAD` como base y
`WORKTREE` como candidato. El snapshot se creó correctamente pero declaró
`changedFiles: []`; el ID se confundió después con un review record. La CLI debe rechazar
por defecto una captura vacía y exigir una intención explícita para los casos legítimos sin
delta.

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

- Inferir automáticamente la rama base correcta.
- Crear commits o ramas para el operador.
- Considerar equivalentes un snapshot y un record del judge.
- Prohibir revisiones intencionales sin delta cuando existe opt-in explícito.

## Clarifications

- None.

## Open Questions

- None.
