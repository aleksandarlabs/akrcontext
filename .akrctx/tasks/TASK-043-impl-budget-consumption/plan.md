# Plan

## Workflow

- TDD

## Reason

Es un bug de conteo. La semántica confirmada es que start informa y log
persiste el intento; TDD protege ese comportamiento.

## Steps

1. Leer `src/impl.ts` para entender cómo se incrementa el contador.
2. Escribir test: start + log = 1 round consumed.
3. Fix: start no incrementa ni reserva; log incrementa al persistir.
4. Verificar que el budget de 3 permite 3 ciclos completos.
