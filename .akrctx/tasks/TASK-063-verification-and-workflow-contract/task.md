# TASK-063

## Goal

Resolver los contratos de validación y proceso proporcional.

## Status

LISTA PARA INVESTIGACIÓN; NO PARA IMPLEMENTAR RUNTIME. Este estado es documentación de planificación, no un campo reconocido por el CLI.

## Recommended Workflow

research-first

## Workflow Notes

- Cambiar APPROVED, autorizaciones o selección de workflow altera contratos existentes; primero se necesitan ejemplos y decisiones.

## Dependencies

- TASK-060

## Implementation Brief

Analizar contratos y preparar cambios separados. No relajar protecciones ni aprobar automáticamente agentes. No editar AGENTS.md ni skills instaladas.

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

### Session 2026-09-06

- La verificación completa requiere que todas las validaciones obligatorias pasen para la revisión actual de la cápsula y la versión concreta del código. Una validación no ejecutada o fallida no verifica completamente la entrega.
- Una tarea de documentación o investigación puede declarar explícitamente que no tiene validaciones de runtime; no puede por ello afirmar que verificó código. La evidencia legacy incompleta se muestra como desconocida. Los veredictos históricos se conservan sin borrarlos ni reinterpretarlos como aprobación actual: se muestran por separado de lo que está verificado ahora.
- La autorización dura una ejecución explícitamente autorizada, que puede incluir varios agentes o sesiones gestionados por el orquestador. Un traspaso manual o una copia del repositorio no transmite permisos; el orquestador debe comprobar el alcance antes de continuar.
- Solo las acciones fuera del alcance autorizado requieren una nueva confirmación. Una publicación o acceso a red ya autorizados expresamente no la requieren de nuevo. Un comando nuevo de validación exige ampliar el plan y autorización antes de ejecutarlo.

## Open Questions

- None.
