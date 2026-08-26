# Context

## Relevant Files

- `src/judge-enforcement.ts` — verificación, aprobación de comandos y `reexecuted`.
- `src/judge-snapshot.ts` — identidad inmutable y workspace desechable.
- `src/cli/judge.ts` — salida humana/JSON y consentimiento.
- `src/templates/judge.ts` — contrato del juez y handoff al caller confiado.
- `docs/JUDGE.md` — declara expresamente que la reejecución no es transferible.
- `tests/akrctx.test.ts` — tests de aprobación, reejecución y snapshots.
- `.akrctx/local/judge/TASK-047-f168058e472295f6fe06.json` — record final que no contiene
  receipt de una reejecución posterior.

## Threat Model Questions To Answer

- Qué actor firma o atestigua el receipt y por qué otro agente debería confiar en él.
- Cómo ligar snapshot ID, record digest, comandos exactos, resultados, CLI version y tiempo.
- Qué cambia si el receipt es local mutable, artefacto CI firmado o simple evidencia UX.
- Cómo revocar/invalidar receipts cuando cambia el snapshot, record, lockfile o política.
- Cómo conservar el consentimiento por ejecución sin convertirlo en autorización reutilizable.

## Blocked Reads

- No leer `.env`, claves, certificados, `secrets/`, `credentials/` ni `private/`.
