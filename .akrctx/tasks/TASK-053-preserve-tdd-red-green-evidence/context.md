# Context

## Relevant Files

- `src/templates/implementer.ts` — instrucciones compartidas por los tres hosts.
- `src/impl.ts` — formato, parser y persistencia append-only de rondas.
- `src/cli/impl.ts` — entrada de validaciones y salida de status/log.
- `tests/agents.test.ts` — presupuesto, logs y validación del implementer.
- `tests/agent-templates.test.ts` — identidad de instrucciones entre hosts.
- `.akrctx/local/impl/TASK-047/log.md` — evidencia local del pase final sin red inicial.
- `docs/WORKFLOWS.md` — definición pública de TDD.

## Evidence Rule

- La evidencia red es un resultado esperado del workflow, no un test “fallido” de la entrega.
- Debe conservar comando, status y salida suficiente para confirmar que falló por la regresión
  buscada, seguido por el mismo comando normalizado en verde.
- El log sigue siendo evidencia operativa local, no una aprobación independiente.

## Blocked Reads

- No leer `.env`, claves, certificados, `secrets/`, `credentials/` ni `private/`.
