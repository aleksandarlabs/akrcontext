# Task

## Goal

Hacer que la delegación al implementer respete la configuración resuelta y dé significado
observable a los triggers reconocidos.

Las instrucciones generadas ordenan preguntar siempre que
`agents.implementer.enabled` sea true y dicen explícitamente ignorar `trigger`. Esto hace que
`on-request` se comporte igual que `post-clarification`, aunque ambos son valores reconocidos
y se presentan al usuario como scheduling hints. Además, una configuración legacy con solo
`impl.enabled` puede resolver el implementer como activo en runtime mientras las instrucciones
no encuentran `agents.implementer.enabled` y no ofrecen delegación.

El agente principal debe usar una única vista resuelta del estado del implementer y aplicar
un contrato distinto para `on-request` y `post-clarification`, sin delegar nunca sin permiso
humano.

## Validation

```
pnpm vitest run tests/agents.test.ts tests/agent-templates.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Invocar automáticamente al implementer sin confirmación humana.
- Cambiar el presupuesto de intentos o el formato del log.
- Añadir nuevos agentes o nuevos triggers.
- Migrar o eliminar las claves legacy.
- Editar copias instaladas bajo `.claude/`, `.agents/`, `.github/skills/` o `.pi/` a mano.

## Clarifications

- None.

## Open Questions

- None.
