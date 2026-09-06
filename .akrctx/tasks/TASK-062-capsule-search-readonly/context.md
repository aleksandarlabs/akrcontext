# Context

## Relevant Files To Inspect

- `src/task.ts`
- `src/cli/task.ts`
- `src/harness-files.ts`
- `src/judge-enforcement.ts`
- `src/cli/shared.ts`
- `tests/akrctx.test.ts`
- `tests/cli.test.ts`
- `README.md`

## Common Design

Leer solo las secciones pertinentes de [design.md](../TASK-060-product-evolution-plan/design.md). El código actual prevalece sobre descripciones históricas; revisar cambios desde la preparación antes de empezar.

## Boundaries

El repositorio es la herramienta, no un consumidor. Shipped content vive en src/templates. No leer secretos ni credenciales; aplicar .akrctx/policy.json. No cargar todas las cápsulas ni la wiki.
