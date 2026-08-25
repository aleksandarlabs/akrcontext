# Task

## Goal

El judge agent genera review records con campos no permitidos por
`review.schema.json` (`evidence`, `independent`). `akrctx judge verify`
rechaza el record como INVALID por `additionalProperties: false`. El agente
debe producir records que pasen validación sin intervención manual.

Los dos campos tienen causas distintas:

- `independent` es un bug de la plantilla. El runtime, las instrucciones del
  judge y el CHANGELOG 0.5.0 lo soportan, pero `src/templates/judge-contract.ts`
  nunca lo tuvo. Toda release publicada instala un schema que prohíbe el campo
  que sus propias instrucciones ordenan emitir.
- `evidence` sí existe en el schema, pero solo dentro de cada entrada de
  `tests`. El judge lo emitió en la raíz, donde no existe.

## Validation

```
npm test
```

## Out Of Scope

- Cambiar las reglas de aprobación del judge.
- Cambiar el flujo de verify.
- El hand-edit del commit `3fc8f28` sobre la copia instalada del schema.
  Es un hallazgo aparte de proceso, no parte de este fix.

## Clarifications

### Session 2026-08-24

- El judge (Opus 4.6) generó `"evidence": "..."` y `"independent": false` en el review record. Ambos fueron rechazados por verify con `Unexpected review field`. El CHANGELOG documenta `independent` como feature de 0.5.0 pero el schema no lo incluye.

### Session 2026-08-25

- `independent` entra en la plantilla del schema como boolean opcional. No es
  una decisión de diseño: el CHANGELOG y el runtime coinciden y la plantilla se
  quedó atrás. Evidencia: `src/judge-enforcement.ts:444` acepta el campo, la
  línea 280 lo usa para degradar el veredicto a verification-only, y
  `src/templates/judge.ts` ordena al agente emitirlo. `git log -S independent`
  sobre `src/templates/judge-contract.ts` no devuelve nada, así que el campo
  nunca se publicó en el schema.
- `evidence` queda prohibido en la raíz del record. Sigue existiendo solo dentro
  de cada entrada de `tests`. Motivo: nada del runtime consume un resumen global,
  el veredicto se sostiene sobre `tests` e `issues`, y el mismo nombre con dos
  significados según el nivel es peor contrato. Un campo publicado en el schema
  ya no se puede quitar sin romper instalaciones.
- El fix amplía el schema y no rompe nada. Todo record válido con el schema
  anterior sigue siendo válido. Entra como `fix`, no como `feat`.

## Open Questions

- Ninguna. La pregunta sobre `independent` quedó resuelta en la sesión
  2026-08-25 con la evidencia citada arriba.
