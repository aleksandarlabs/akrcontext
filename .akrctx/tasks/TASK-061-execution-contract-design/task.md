# TASK-061

## Goal

Diseñar identidad de ejecución, estado y traspaso recuperable.

## Status

LISTA PARA INVESTIGACIÓN; NO PARA IMPLEMENTAR RUNTIME. Este estado es documentación de planificación, no un campo reconocido por el CLI.

## Recommended Workflow

research-first

## Workflow Notes

- El almacenamiento, la compatibilidad y la autorización necesitan un contrato resuelto antes de código.

## Dependencies

- TASK-060

## Implementation Brief

Investigar y entregar un contrato revisable; no instalar infraestructura ni crear un orquestador. El siguiente agente puede completar toda la investigación sin aprobación adicional; las decisiones materiales pendientes se preguntan antes de código.

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

- La reanudación portable usará un archivo de continuación versionado, separado de los cinco archivos de especificación. Contendrá identidad de ejecución, revisión de cápsula y código, progreso, bloqueos, decisiones pendientes, intentos consumidos y resumen de validaciones.
- Logs completos, conversaciones, snapshots, procesos, reservas, credenciales y permisos permanecen locales. Al reanudar se comprobarán las referencias y la vigencia del estado.
- La autorización pertenece a una ejecución explícitamente autorizada, que puede abarcar varios agentes o sesiones gestionados por un orquestador. Un traspaso manual o una copia del repositorio no transmite autorizaciones; el orquestador debe comprobar su alcance antes de continuar.
- No se heredan automáticamente aprobaciones ni autorizaciones de ejecución. Las acciones fuera del alcance autorizado requieren confirmación; las acciones expresamente autorizadas, incluida red o publicación, no la requieren de nuevo. Un comando nuevo de validación exige ampliar el plan y obtener autorización antes de ejecutarlo.

## Open Questions

- None.
