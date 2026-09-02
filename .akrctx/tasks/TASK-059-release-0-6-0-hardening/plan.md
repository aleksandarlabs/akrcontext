# Plan

## Workflow

- SDD+TDD

## Reason

La tarea corrige una frontera de seguridad, un contrato persistido compatible hacia delante
y el artefacto distribuible. Primero hay que fijar el comportamiento y demostrar las
regresiones antes de modificar runtime o packaging.

## Behavior Contract

- **Inputs:** salida diagnóstica acotada, logs implementer previos, árbol `dist` potencialmente
  sucio y metadata/documentación de release.
- **Outputs:** secretos comunes redactados también en asignaciones con clave entrecomillada;
  logs TDD legacy legibles y capaces de avanzar con una ronda nueva válida; build que elimina
  artefactos obsoletos; release 0.6.0 con migración judge exacta.
- **Preconditions:** no se inventa evidencia TDD para registros previos y no se adopta ningún
  secreto real como fixture.
- **Postconditions:** una ronda TDD nueva inválida sigue siendo rechazada antes de persistir;
  registros legacy sin campos de fase no bloquean una ronda posterior válida; `npm pack`
  contiene solo el `dist` generado por el build actual; versiones de package y CLI coinciden.
- **Out of scope:** publicación efectiva, reescritura de logs y redacción semántica universal.

## Steps

1. Añadir regresiones fallidas para JSON redactado, continuidad TDD legacy y build limpio.
2. Implementar los cambios mínimos en runtime y packaging.
3. Actualizar changelog y versiones a 0.6.0.
4. Regenerar el harness dogfooded mediante la CLI cuando corresponda.
5. Ejecutar validación focalizada, gates completos y comprobación del paquete.
