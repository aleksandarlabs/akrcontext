# Context

## Relevant Files

- `src/templates/judge-contract.ts` — plantilla del schema. Es la fuente real;
  genera `.akrctx/judge/schemas/review.schema.json` en cada instalación.
- `src/templates/judge.ts` — instrucciones del judge y ejemplo embebido
  (`judgeExampleRecord`).
- `src/judge-enforcement.ts` — `validateRecord` y la lista de campos permitidos.
- `.akrctx/judge/schemas/review.schema.json` — copia instalada en este repo.
- `tests/agent-templates.test.ts` — tests de las plantillas de agente.
- `CHANGELOG.md` — documenta `independent` en 0.5.0.

## Corrections

- `context.md` apuntaba antes a `src/judge-verify.ts`. Ese archivo no existe.
  `validateRecord` está en `src/judge-enforcement.ts:440`.

## Blocked Reads

- Secrets and credentials must not be read.
