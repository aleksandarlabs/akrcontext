# Plan

## Workflow

- TDD

## Reason

Es un bugfix en un parser, y `workflowRules.bugfix` es TDD. El fallo se
describe con entradas exactas y salidas exactas, así que un test que falla
primero fija la frontera entre "variante de none" y "pregunta real".

## Steps

1. Escribir tests que fallen para `- None remaining.`, `- None left.` y
   `- None so far.` bajo las dos secciones. Mantener los tests ya verdes de
   `- None.`, `- Ninguna.`, `- N/A` y `- None recorded yet.`.
2. Escribir un test que proteja `- None of the callers validate X` como
   entrada real.
3. Ampliar `NONE_VARIANT_RE` en `src/judge-enforcement.ts` con la lista de
   palabras de cierre.
4. Borrar `CLARIFICATION_PLACEHOLDER`; el regex ya cubre esa frase.
5. Ejecutar `npm test`.
