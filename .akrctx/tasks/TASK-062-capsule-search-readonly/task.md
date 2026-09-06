# TASK-062

## Goal

Buscar texto en las cápsulas existentes con resultados citables.

## Status

IMPLEMENTACIÓN COMPLETADA; revisión independiente pendiente. Este estado es documentación de planificación, no un campo reconocido por el CLI.

## Recommended Workflow

SDD+TDD

## Workflow Notes

- API CLI pequeña, determinista y de solo lectura; los ejemplos delimitan el comportamiento sin depender de nuevos metadatos.

## Dependencies

- TASK-060

## Implementation Brief

Implementar únicamente recuperación textual determinista. Exportar lógica testeable desde módulo adecuado; usar patrones de CLI y errores existentes. No refactorizar módulos ajenos. Esta primera entrega permite recuperar antecedentes; búsqueda semántica, ranking y síntesis quedan en fases posteriores.

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
