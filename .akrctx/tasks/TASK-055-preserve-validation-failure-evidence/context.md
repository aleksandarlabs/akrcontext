# Context

## Relevant Files

- `src/judge-snapshot.ts`
- `src/judge-verify.ts`
- `src/templates/instructions.ts`
- `src/templates/agents.ts`
- `tests/akrctx.test.ts`
- `tests/agent-templates.test.ts`
- `docs/JUDGE.md`

## Evidence Boundary

La evidencia debe ser útil para diagnóstico y auditoría sin ampliar la superficie de datos.
Debe aplicar redacción y límites de tamaño existentes, distinguir salida observada de
interpretación y permanecer ligada a la ejecución concreta.

## Blocked Reads

- `.env*`
- Private keys or certificates
- `secrets/`
- `credentials/`
