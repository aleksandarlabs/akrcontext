# Context

## Relevant Files

- `src/upgrade.ts` — escribe los candidatos en
  `.akrctx/upgrades/<CLI_VERSION>/` (líneas 103, 204, 249, 336). Ahí va el
  borrado. `coversAllTargets` ya existe y es la condición del run completo.
- `src/init.ts:107` — escribe `.akrctx/local/.gitignore`. El nuevo ignore va
  por el mismo camino.
- `src/templates/defaults.ts:56` — `localComprehensionIgnoreTemplate`, que
  contiene `*\n!.gitignore\n`. Es el patrón a repetir.
- `src/doctor.ts:148` — repara el ignore local con `--fix`. Precedente directo
  de la comprobación nueva.
- `src/harness-files.ts` — fuente única de qué archivos conoce cada target. Un
  archivo generado que no esté aquí es invisible para doctor, upgrade y remove.
- `src/template-apply.ts` — `writePlannedFile` y los tipos de escritura.

## Precedents

- `akrctx judge prune` previsualiza por defecto y exige `--force`. Por eso el
  borrado de versiones anteriores queda fuera de alcance: sería destructivo y
  necesitaría su propia puerta.

## Blocked Reads

- Secrets and credentials must not be read.
