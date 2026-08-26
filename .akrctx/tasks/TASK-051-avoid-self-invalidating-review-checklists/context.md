# Context

## Relevant Files

- `.akrctx/tasks/_template/review-checklist.md` y `src/templates/instructions.ts` — flujo de
  checklist y handoff que reciben los proyectos instalados.
- `src/templates/*` — fuente de las skills e instrucciones generadas.
- `src/judge-enforcement.ts` — cálculo de `taskDigest` sobre los cinco archivos de cápsula.
- `src/judge-snapshot.ts` — catch-up y clasificación de cambios posteriores.
- `tests/agent-templates.test.ts` y `tests/akrctx.test.ts` — contratos generados y snapshots.
- `.akrctx/tasks/TASK-047-secure-snapshot-artifact-build/review-checklist.md` — evidencia del
  bucle observado durante dogfooding.
- `docs/JUDGE.md` y `docs/WORKFLOWS.md` — documentación de handoff.

## Required Invariant

- El lead agent completa todos los cambios de la cápsula antes de capturar.
- Después del APPROVED no escribe un checkbox que solo repita la existencia del record.
- Cualquier cambio sustantivo posterior sigue requiriendo catch-up.

## Blocked Reads

- No leer `.env`, claves, certificados, `secrets/`, `credentials/` ni `private/`.
