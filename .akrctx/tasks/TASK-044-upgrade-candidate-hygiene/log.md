# Implementation Log

## 2026-08-25

### Cambios

- `src/harness-files.ts`: constantes `upgradesDir` y `upgradesIgnorePath`, y la
  ruta del ignore añadida a `neutralRequired`. Esa lista es la que hace visible
  un archivo para `doctor`, `upgrade` y `remove`.
- `src/templates/defaults.ts`: `selfIgnoringDirectoryTemplate` con el contenido
  `*\n!.gitignore\n`. `localComprehensionIgnoreTemplate` pasa a apuntar ahí y se
  añade `upgradesIgnoreTemplate`. Ningún nombre exportado cambia.
- `src/init.ts` y `src/upgrade.ts`: escriben el ignore. En upgrade va por
  `preserveProjectKnowledge`, que crea el archivo solo si falta y nunca pisa uno
  existente.
- `src/upgrade.ts`: `removeResolvedCandidates` y `removeEmptyDirectories`. El
  resultado expone `removed: string[]`.
- `src/doctor.ts`: `fixLocalIgnore` se generaliza en `fixSelfIgnoringDirectory`,
  con parámetros de ruta, contenido y motivo. Se llama dos veces.
  `getLocalPrivacyGaps` comprueba ahora los dos ignores.
- `src/cli/upgrade.ts`: sección de salida para los borrados y tres líneas de
  ayuda que explican la regla.
- `tests/akrctx.test.ts`: bloque `upgrade candidate hygiene` con 11 tests.

### Cómo se decide qué borrar

El run reescribe todo candidato que siga sin resolver. Por tanto, un archivo bajo
`.akrctx/upgrades/<CLI_VERSION>/` que el run no ha escrito es, por definición, uno
resuelto. La lista de escritos sale de las entradas `kind: "suggest"` de `writes`,
así que los cuatro sitios que generan candidatos quedan cubiertos sin tocarlos.

### Detalles que costaron una corrección

- Los gaps de doctor no aparecen en `suggestions` con su ruta. `buildSuggestions`
  solo emite un recuento. La ruta sale en `result.missing`, y así lo asserta el
  test que ya existía para el ignore local (`tests/akrctx.test.ts:4191`).
- El snapshot de `upgrade --help` cambió al añadir las líneas de ayuda. Se
  regeneró con `vitest -u`.

### Validación

- `npm test`: 760 tests, 8 archivos, todo en verde.
- `npm run lint`: 96 archivos, sin hallazgos.
- `npm run build`: correcto.

### Comprobación sobre el repo real

`akrctx upgrade` borró los tres candidatos de 0.5.0 ya resueltos, conservó los dos
de `CLAUDE.md` y `AGENTS.md` que siguen sin resolver, no tocó `0.4.0/` y creó el
ignore. `git check-ignore` confirma que los candidatos ya no entran en el diff.
