# TASK-060

## Goal

Preparar el plan de evolución y las primeras cápsulas.

## Status

DOCUMENTACIÓN COMPLETADA Y VALIDADA; sin revisión independiente. Este estado es documentación de planificación, no un campo reconocido por el CLI.

## Recommended Workflow

SDD

## Workflow Notes

- Documentación y contratos de trabajo; no se implementa runtime.

## Dependencies

- Ninguna.

## Implementation Brief

Crear design.md como referencia común y capsules para las primeras unidades. No cambiar src, tests ni copias instaladas.

Referencia común: [Plan de evolución](../TASK-060-product-evolution-plan/design.md).

## Validation

Desde la raíz del repositorio. Para investigación son controles de compatibilidad, no prueba de aprobación del diseño. Doctor puede escribir reportes; revisar su diff y no mezclarlo con la entrega.

```sh
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Implementar otras fases del plan.
- Editar copias instaladas o instrucciones protegidas.
- Publicar, desplegar o comunicarse con sistemas externos.

## Clarifications

### Session 2026-09-05

- El usuario autorizó preparar el documento general, el mapa de dependencias y las primeras cápsulas para trabajarlas con otro agente.
- Deben soportarse un agente único y preparación/implementación en sesiones y modelos distintos.
- Esta autorización no confirma las alternativas de arquitectura todavía abiertas.

## Open Questions

- None.
