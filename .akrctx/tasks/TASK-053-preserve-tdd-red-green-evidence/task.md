# Task

## Goal

Hacer verificable en el log del implementer el orden red→green exigido por TDD y workflows
combinados.

El informe de TASK-047 afirmó que primero se añadió una regresión fallida, pero el log solo
conservó el pase posterior. El código final y sus tests son verificables; el orden TDD no lo
es. La instrucción genérica de registrar fallos no basta para que el agente identifique el
fallo inicial como evidencia obligatoria del workflow.

Cuando la cápsula declare TDD, SDD+TDD o TDD+EDD, el implementer debe registrar en la misma
ronda el comando de regresión fallando por el motivo esperado y después pasando. Si no puede
obtener el red correcto, debe devolver un bloqueo en vez de afirmar que siguió TDD.

El workflow efectivo se lee de la sección `## Workflow` de `plan.md`; no se infiere de otro
campo de la cápsula. La evidencia red y green usa el mismo comando después de normalizar
espacios en blanco, y una ronda TDD inválida se rechaza antes de persistirse.

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

- Demostrar criptográficamente el orden temporal de comandos.
- Hacer que el judge confíe en el log del implementer como prueba de corrección.
- Exigir red→green a workflows sin TDD.
- Cambiar el presupuesto de rondas.

## Clarifications

- None.

## Open Questions

- None.
