# Plan

## Workflow

- SDD

## Reason

El cambio es de contrato documental: define cuándo un agente delega en otro y
quién conserva la responsabilidad del capsule y de la validación. El texto es el
entregable, así que lo que hay que acertar es la especificación, no el
comportamiento en tiempo de ejecución. Los dos tests son de presencia y de valor
por defecto, y no justifican un ciclo TDD completo.

## Steps

1. Redactar el bloque de delegación para `src/templates/instructions.ts`.
2. Ajustar el paso 7 de la secuencia para que no presuponga quién implementó.
3. Cambiar `defaultTrigger.implementer` a `post-clarification`.
4. Añadir los dos tests.
5. Regenerar los archivos afectados y revisar el diff del repo dogfooded.
