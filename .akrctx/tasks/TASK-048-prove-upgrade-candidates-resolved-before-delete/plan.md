# Plan

## Workflow

- SDD+TDD

## Reason

La operación borra datos y su criterio de resolución es parte del contrato público de
upgrade. Hace falta especificar qué constituye evidencia suficiente y codificar primero
los escenarios donde la inferencia por ausencia provoca pérdida de información.

## Behavior Contract

- **Inputs:** candidatos bajo la versión actual, configuración e inventario actuales,
  procedencia disponible y contenido del archivo destino.
- **Outputs:** una lista determinista de candidatos demostrablemente resueltos; en dry-run
  solo se informa y en modo aplicado solo esos paths se eliminan.
- **Preconditions:** ningún archivo se considera propiedad borrable de akrctx solo por estar
  dentro de un directorio ignorado o por no aparecer en los `writes` actuales.
- **Postconditions:** candidatos pendientes sobreviven a desactivación de agentes, retirada
  de targets y cambios de inventario; archivos sin procedencia sobreviven; un candidato
  aplicado puede limpiarse y se informa en `UpgradeResult.removed`.
- **Out of scope:** limpieza de versiones antiguas o heurísticas destructivas.

## Implementation Brief

1. Escribir regresiones para agente desactivado, target retirado, archivo ya no gestionado y
   archivo ajeno; confirmar que la implementación actual los borra.
2. Definir una prueba positiva de resolución. Puede reutilizar hashes/procedencia o comparar
   de forma segura el candidato conocido con su destino, pero no puede depender únicamente
   del conjunto de sugerencias generado en el run actual.
3. Aplicar la misma clasificación en dry-run y ejecución real.
4. Mantener intactos los límites existentes: otros CLI_VERSION, runs parciales y el propio
   `.akrctx/upgrades/.gitignore`.
5. Actualizar ayuda y changelog si cambia la definición observable de `removed`.

## Steps

1. Fijar ejemplos destructivos con tests fallidos.
2. Implementar clasificación conservadora con procedencia verificable.
3. Validar preview y aplicación real.
4. Completar checklist y solicitar revisión independiente.
