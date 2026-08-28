# Plan

## Workflow

- SDD+TDD

## Reason

Es una refactorización de una frontera destructiva y de un contrato interno observable. Hay
que fijar primero el invariante y proteger cada productor con regresiones.

## Behavior Contract

- Una sola operación crea candidatos y actualiza su procedencia.
- Solo una creación física confirmada puede originar una entrada en `manifest.candidates`.
- Un archivo preexistente nunca se adopta, aunque coincida con el contenido deseado.
- Dry-run informa igual que una ejecución real, pero no escribe ni registra procedencia.
- El candidato que reemplaza el manifest usa un ledger externo bajo `.akrctx/local/`, no
  listado en `src/harness-files.ts`; el ledger solo se escribe después de una creación física
  confirmada y la limpieza exige ledger, hash intacto y bytes aplicados iguales.
- El caller no transporta `createdCandidate` ni mantiene conjuntos auxiliares manualmente.

## Steps

1. Inventariar todos los productores: managed files, root instructions, manifest inválido y
   policy inválida.
2. Añadir una matriz de regresiones que pruebe creación real, archivo preexistente y dry-run
   para cada productor, incluyendo la instalación y limpieza del candidato de manifest.
3. Introducir una abstracción única de candidato y migrar todos los productores.
4. Eliminar la propagación manual y comprobar que no quedan call sites alternativos.
5. Ejecutar validación completa y revisión independiente.
