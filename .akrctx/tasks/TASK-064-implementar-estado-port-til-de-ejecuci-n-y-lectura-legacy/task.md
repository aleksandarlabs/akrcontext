# TASK-064

## Goal

Implementar el contrato v1 y la lectura segura del estado portable de ejecución, sin modificar la frontera actual del juez.

## Status

LISTA PARA IMPLEMENTACIÓN: primera entrega P02 (schema, lector y consulta CLI). La producción automática y transiciones de ejecución se integran en P03/P04; no se añaden escritores antes del contrato de reservas.

## Dependencies

- TASK-061 y TASK-063: diseños revisados y correcciones aceptadas.
- TASK-067 consumirá el resultado validado de este lector para su exclusión estrecha; esta tarea NO excluye continuation.json del juez actual.

## Recommended Workflow

SDD+TDD

## Workflow Notes

- Contrato/API nuevos con compatibilidad legacy y errores de lectura: especificación explícita y tests de comportamiento antes de implementación.

## Implementation Brief

Leer contract.md y los criterios. Añadir src/continuation.ts con tipos, validación estricta y lector; comando akrctx task continuation TASK-ID [--json]. Mantener cinco archivos canónicos y no crear sidecars automáticamente. Formato portable versionado, sin permisos ni digests locales. El lector reporta declaraciones; no verifica snapshots, no concede permiso ni cambia estados.

## Validation

```sh
pnpm exec vitest run tests/continuation.test.ts tests/cli.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Escritores, importadores, reservas, actualización automática de progreso, nuevas ejecuciones o reconciliación de logs (TASK-065/066).
- Cambiar judge, snapshots, digests existentes o APPROVED (TASK-067).
- Cambiar formato de cinco Markdown, skills instaladas, instrucciones protegidas o versión del CLI.
- Red, proveedores LLM, publicación, commits o merges.

## Clarifications

### Session 2026-09-07

- El usuario autorizó que el agente principal complete el contrato y coordine implementación mediante subagentes más económicos.
- Se comienza por TASK-064; las tareas dependientes se prepararán contra el resultado.
- Decisión de partición técnica: exponer el lector y contrato antes de automatizar escritura. Un sidecar existente seguirá afectando a la revisión actual hasta TASK-067; documentar este límite expresamente.

## Open Questions

- None.
