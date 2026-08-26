# Context

## Relevant Files

- `src/upgrade.ts` — genera candidatos y elimina actualmente todo archivo no presente en
  los `writes` del run.
- `src/harness-files.ts` — inventario central de archivos gestionados y paths de upgrades.
- `src/manifest.ts` — modelo existente de procedencia por hash para archivos gestionados y
  registro durable de candidatos de upgrade.
- `src/fs-utils.ts` — escritura preserve/suggest y helpers de paths.
- `tests/akrctx.test.ts` — bloque `upgrade candidate hygiene` y pruebas de upgrade.
- `src/cli/upgrade.ts` — salida humana de candidatos eliminados.
- `.akrctx/tasks/TASK-044-upgrade-candidate-hygiene/` — contrato que introdujo la limpieza
  y asumió que todo candidato pendiente sería regenerado.

## Failure Cases To Preserve

- Un candidato pendiente de un agente que después se desactiva.
- Un candidato pendiente de un target retirado de `config.targets`.
- Un candidato de un archivo que deja de formar parte del inventario gestionado.
- Un archivo regular no creado por akrctx dentro del directorio ignorado de la versión.
- Un archivo extranjero en la ruta de un destino real con contenido idéntico.
- Un candidato registrado cuyo contenido fue manipulado.
- Un run parcial por target y un `--dry-run`.

## Blocked Reads

- No leer `.env`, claves, certificados, `secrets/`, `credentials/` ni `private/`.
