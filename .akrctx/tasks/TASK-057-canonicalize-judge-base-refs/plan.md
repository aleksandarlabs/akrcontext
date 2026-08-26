# Plan

## Workflow

- SDD+TDD

## Reason

Corrige un fallo reproducible en el contrato criptográfico de snapshots y afecta metadata
persistida. Requiere fijar compatibilidad y regresiones antes de cambiar la representación.

## Behavior Contract

- Toda base aceptada se resuelve a un hash completo durante la captura.
- Scope, snapshot y reejecución usan el hash canonicalizado.
- `verify --run-tests` funciona aunque la copia desechable no tenga branches ni refs remotas.
- Una ref inexistente falla antes de publicar el snapshot.
- Snapshots existentes que ya contienen una base resoluble mantienen compatibilidad.

## Steps

1. Reproducir la captura con una ref simbólica y la ausencia de esa ref en validación.
2. Definir el campo canonical y la compatibilidad con metadata existente.
3. Resolver la base una vez y propagar exclusivamente el hash operativo.
4. Añadir regresiones para branch local, ref remota, tag y hash completo.
5. Actualizar documentación y ejecutar la revisión independiente.
