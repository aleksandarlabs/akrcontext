# Context

## Relevant Files To Inspect

- `src/types.ts`
- `src/agents.ts`
- `src/impl.ts`
- `src/task.ts`
- `src/compile.ts`
- `src/judge-enforcement.ts`
- `src/hook/report.ts`
- `.akrctx/tasks/TASK-043-impl-budget-consumption/task.md`
- `.akrctx/tasks/TASK-054-design-transferable-validation-receipts/task.md`

## Common Design

Leer solo las secciones pertinentes de [design.md](../TASK-060-product-evolution-plan/design.md). El código actual prevalece sobre descripciones históricas; revisar cambios desde la preparación antes de empezar.

## Boundaries

El repositorio es la herramienta, no un consumidor. Shipped content vive en src/templates. No leer secretos ni credenciales; aplicar .akrctx/policy.json. No cargar todas las cápsulas ni la wiki.
