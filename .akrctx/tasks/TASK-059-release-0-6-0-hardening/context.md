# Context

## Relevant Files

- `src/validation-evidence.ts`
- `src/impl.ts`
- `package.json`
- `src/version.ts`
- `pnpm-lock.yaml`
- `CHANGELOG.md`
- `tests/akrctx.test.ts`
- `tests/agents.test.ts`
- `tests/dogfood.test.ts`

## Existing Evidence

- La revisión del rango `v0.5.0..HEAD` encontró cuatro hallazgos reproducibles.
- La suite previa estaba verde con 867 tests, pero no cubría secretos con claves JSON
  entrecomilladas ni la continuación de un log TDD previo al contrato de fases.
- `npm pack --dry-run` incluyó 526 entradas y 9.3 MB descomprimidos porque `dist` acumulaba
  chunks obsoletos; el build actual no limpiaba el directorio.
- El runtime final exige judge schema v5 y snapshot v6, mientras el changelog aún nombraba v3.

## Blocked Reads

- No leer `.env`, claves, certificados, `secrets/`, `credentials/` ni `private/`.
