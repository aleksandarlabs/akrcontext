# Context

## Relevant Files To Inspect

- `src/templates/instructions.ts`
- `src/templates/defaults.ts`
- `src/task.ts`
- `src/doctor.ts`
- `src/judge-enforcement.ts`
- `src/templates/judge-contract.ts`
- `src/templates/judge.ts`
- `.akrctx/tasks/TASK-050-honor-implementer-trigger/task.md`
- `.akrctx/tasks/TASK-051-avoid-self-invalidating-review-checklists/task.md`
- `.akrctx/tasks/TASK-054-design-transferable-validation-receipts/task.md`

## Common Design

Leer solo las secciones pertinentes de [design.md](../TASK-060-product-evolution-plan/design.md). El código actual prevalece sobre descripciones históricas; revisar cambios desde la preparación antes de empezar.

## Boundaries

El repositorio es la herramienta, no un consumidor. Shipped content vive en src/templates. No leer secretos ni credenciales; aplicar .akrctx/policy.json. No cargar todas las cápsulas ni la wiki.
