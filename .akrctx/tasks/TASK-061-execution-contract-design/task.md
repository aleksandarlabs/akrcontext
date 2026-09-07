# TASK-061

## Goal

Diseñar identidad de ejecución, estado y traspaso recuperable.

## Status

DISEÑO ENTREGADO; PENDIENTE DE REVISIÓN INDEPENDIENTE. No implementar runtime desde esta cápsula. Este estado es documentación de planificación, no un campo reconocido por el CLI.

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

### Revisión documental 2026-09-06

- `continuation.json` se modela como la única `executionMetadata` reconocida, con digest y actualidad propios; no altera la frontera de código, pero nunca queda excluida de toda observación.
- Commit es sólo referencia auxiliar: reanudación y verificación comparan la identidad de revisión versionada derivada del snapshot y bloquean cuando no está disponible.
- Un resumen portable válido conserva consumo aunque falten logs locales; ausencia de ambas fuentes es desconocida, y divergencia exige reconciliación. Un nuevo `runId` no reinicia la cuenta de presupuesto sin extensión explícita.
- Estado persistido y permiso efectivo se separan: el grant permanece local; `superseded` y recuperación tras caída quedan en la tabla de transiciones.
- `reviewContentDigest` es la identidad portable; `reviewWorkspaceDigest` sólo verifica la propia captura local. Alta/baja o `rename` del sidecar activo actualiza metadata, no el snapshot; si se altera dentro del snapshot, falla su integridad y recapturar no transfiere aprobación.

## Open Questions

- None.
