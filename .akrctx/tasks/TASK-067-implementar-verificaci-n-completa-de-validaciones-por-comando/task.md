# TASK-067

## Goal

Implementar la verificación completa por comando: toda validación obligatoria declarada debe pasar
sobre la misma revisión de cápsula y la misma identidad de contenido de código. Publicar los dos
ejes de revisión y excluir de forma estrecha el sidecar de continuación válido.

## Status

LISTA PARA IMPLEMENTACIÓN. Alcance P05 completo confirmado por el usuario el 2026-09-07.
Se entrega en tres paquetes: W1 declaración y puerta estricta, W2 identidad de contenido en el
snapshot, W3 dos ejes y presentación. Ver contract.md.

## Dependencies

- TASK-063: diseño P05 revisado. Fija las cinco decisiones confirmadas y la tabla de migración.
- TASK-064: `readTaskContinuation` ya valida el schema v1 y devuelve `status`, ruta literal y
  `continuationDigest` de bytes. Esta tarea lo consume para decidir qué archivo cuenta como
  metadata de ejecución. `status: "valid"` no demuestra vigencia, permiso ni identidad del emisor.

## Recommended Workflow

SDD+TDD

## Workflow Notes

- Workflow source: contrato de revisión con cambio de comportamiento observable.
- Why this workflow: la puerta de aprobación cambia de semántica. Un test que hoy pasa debe fallar
  antes de la implementación, para demostrar que la regla estricta es la que produce el cambio.
- Cargar sólo `src/judge-enforcement.ts`, `src/judge-snapshot.ts`, `src/continuation.ts`,
  `src/cli/judge.ts` y el bloque `describe("judge")` de `tests/akrctx.test.ts`.

## Implementation Brief

Leer contract.md antes de tocar código. W1 cambia el parser y la puerta en
`src/judge-enforcement.ts`. W2 añade `reviewContentDigest` y `reviewWorkspaceDigest` en
`src/judge-snapshot.ts` con subida de versión de schema del snapshot. W3 añade los ejes
`reviewBoundary` y `executionMetadata` y separa `historicalVerdict` de `verifiedNow`.

Conservar el significado exacto de `contentDigest` y `workspaceDigest`. No renombrar campos
antiguos. No migrar cápsulas existentes de forma automática.

## Validation

Commands that prove this task works. The judge must run at least one of these to
approve, and `akrctx judge verify --run-tests` re-runs the ones the review claims
passed. Nothing outside this list is ever executed.

```
pnpm exec vitest run tests/akrctx.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx doctor --json
```

## Out Of Scope

- Clasificador de workflow por intención (TASK-069 / P14a).
- Doctor operativo opt-in (TASK-070 / P14b).
- Reservas de intentos y reanudación (TASK-065 / TASK-066).
- Escritores del sidecar de continuación. Esta tarea sólo lee.
- Emisor, firma o raíz de confianza. Un digest local nunca es autenticidad.
- Migración automática de cápsulas o de registros de juez ya guardados.
- Red, proveedores LLM, publicación, commits o merges.

## Clarifications

### Session 2026-09-07

- Alcance: el usuario eligió P05 completo en una sola cápsula, frente a entregar sólo la
  verificación estricta. Los tres paquetes van en la misma frontera de revisión.
- Sintaxis: el usuario eligió sufijo explícito `# optional` frente a tratar toda línea como
  obligatoria sin sintaxis nueva. Esto obliga a parser y a pruebas de compatibilidad.
- Decisión técnica del agente, reversible: el marcador se reconoce sólo al final de línea y no se
  retira ningún otro comentario final, para que ninguna cápsula existente cambie de identidad.
- Decisión técnica del agente, reversible: `kind` distinto de `runtime` se declara con una única
  línea `no-runtime-validation: <razón>` dentro de la valla. El diseño exigía razón explícita pero
  no fijaba sintaxis.
- El conjunto de reejecución sigue siendo `declaredAndPassing`. Bajo la puerta estricta ya contiene
  todos los obligatorios, así que no se amplía la superficie de aprobación de órdenes.

### Session 2026-09-08

- El usuario decidió que ceden los documentos, no el código. Una cápsula legacy informa
  `verifiedNow: unknown` y conserva `approved` como eje histórico. La alternativa era añadir una
  razón de rechazo, que habría roto toda cápsula sin sección `## Validation`.
- El usuario decidió dejar como está que `no-runtime-validation:` produzca `approved: true` con
  `tests` vacío, y registrarlo como pregunta abierta en vez de sentar precedente en silencio.

## Open Questions

- Si las tres puertas que hoy consultan `verified.approved` deberían consultar `verifiedNow` en su
  lugar. Son el snapshot de puesta al día con `--from-review`, `judge current`, y el traspaso al
  agente de comprensión. Usan el eje histórico para decidir algo actual, que es justo la brecha que
  el diseño quería cerrar. No se cambió en esta cápsula.
- Si `kind: "documentation"` debería producir aprobación plena con `tests` vacío, o un estado
  propio que no abra esas mismas puertas.
- Si `akrctx doctor` debería detectar la deriva entre una plantilla de `src/` y su copia instalada.
  Hoy da 100 con los archivos generados desincronizados, cosa que ocurrió dos veces en esta rama.
