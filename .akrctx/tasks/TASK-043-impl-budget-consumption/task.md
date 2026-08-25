# Task

## Goal

`akrctx impl start` y `akrctx impl log` consumen rounds del budget de forma
confusa. En la sesión de TASK-020, `impl start` contó como round 1, y el
`impl log` posterior contó como round 2. El implementador pensaba estar en
round 1, pero el budget ya llevaba 2 de 3 consumidos.

El problema es que `impl start` registra un round de apertura y `impl log`
registra otro. El budget de 3 se gasta en 1.5 intentos reales. Clarificar si
`impl start` es informativo (no consume budget) o si es el inicio del round
(y `impl log` es su cierre), y hacer que el comportamiento sea coherente.

## Validation

```
npm test
```

## Out Of Scope

- Cambiar el budget default (3 es razonable si cada intento es un round
  completo).
- Cambiar la interfaz del implementador agent.

## Clarifications

### Session 2026-08-24

- En TASK-020 de un repo consumidor: `impl start` reportó "round 1 of 3, attempts used: 0, remaining: 3". Después, `impl log` reportó "round 2 recorded, attempts used: 2, remaining: 1". Un solo intento real consumió 2 de 3 rounds del budget.

## Open Questions

- ¿`impl start` debería ser solo informativo (no incrementar el contador) o debería `impl log` no incrementar si ya hay un start abierto?
