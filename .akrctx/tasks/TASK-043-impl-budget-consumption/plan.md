# Plan

## Workflow

- TDD

## Reason

Es un bug de conteo. El fix es claro una vez que se decide la semántica
(start abre, log cierra, juntos son 1 round). TDD para escribir el test
del comportamiento correcto primero.

## Steps

1. Leer `src/impl.ts` para entender cómo se incrementa el contador.
2. Escribir test: start + log = 1 round consumed.
3. Fix: start no incrementa, log incrementa (o start abre, log cierra el
   mismo round).
4. Verificar que el budget de 3 permite 3 ciclos completos.
