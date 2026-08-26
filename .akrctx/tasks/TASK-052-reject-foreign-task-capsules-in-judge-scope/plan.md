# Plan

## Workflow

- SDD+TDD

## Reason

El cambio añade una precondición visible a dos comandos públicos y afecta la identidad del
scope. Necesita contrato, CLI y regresiones end-to-end.

## Behavior Contract

- **Inputs:** task ID solicitado, changedFiles completos y una lista opcional y explícita de
  task IDs adicionales aceptados por el operador.
- **Outputs:** scope normal si no hay cápsulas extranjeras; error determinista con IDs y paths
  si las hay; scope que registra cualquier inclusión explícita.
- **Preconditions:** nada se elimina silenciosamente de `changedFiles`.
- **Postconditions:** un judge de TASK-047 nunca recibe TASK-048 sin que el caller lo haya
  declarado; JSON y salida humana hacen visible el scope conjunto.
- **Out of scope:** allowlists completas de archivos fuente.

## Implementation Brief

1. Detectar paths con patrón `.akrctx/tasks/TASK-NNN-*` y compararlos con el task solicitado.
2. Añadir tests rojos para scope, snapshot y catch-up con una cápsula extranjera untracked.
3. Fallar por defecto enumerando cada task ID extranjero y una acción segura: aislar/commit o
   repetir con opt-in explícito.
4. Diseñar un flag repeatable y estrecho para inclusión intencional; ligarlo al scope digest
   para que no sea solo una decisión efímera de UI.
5. Cubrir misma task, template `_template`, paths parecidos, múltiples tasks y salida JSON.
6. Documentar el límite: otros archivos no se infieren ni se excluyen.

## Steps

1. Especificar el nuevo campo/flag y escribir tests fallidos.
2. Implementar detección y binding del opt-in.
3. Actualizar CLI, tipos y documentación.
4. Ejecutar validación completa y solicitar review.
