# Context

## Relevant Files

- `src/upgrade.ts` — contiene los productores de candidatos y la propagación manual actual.
- `src/fs-utils.ts` — define `writePlannedFile` y distingue creación de preservación.
- `src/manifest.ts` — contrato durable de `manifest.candidates`.
- `src/types.ts` — clasificación pública de escrituras.
- `tests/akrctx.test.ts` — regresiones de higiene y resolución de candidatos.

## Failure History

- Un candidato preexistente fue adoptado porque el resultado real de `writePlannedFile` se
  descartaba y se fabricaba después un `kind=suggest`.
- El candidato de reparación de `policy.json` sí devolvía `createdCandidate`, pero el caller
  olvidaba incorporarlo al conjunto de procedencia.

## Constraints

- La clasificación pública puede seguir mostrando `suggest` aunque internamente la escritura
  física haya sido `create`.
- `--dry-run` debe producir la misma clasificación sin persistir archivo ni procedencia.
- Ninguna ruta productora puede registrar procedencia mediante una llamada manual separada.
