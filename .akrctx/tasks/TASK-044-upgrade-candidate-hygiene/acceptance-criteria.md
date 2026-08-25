# Acceptance Criteria

- `akrctx init` escribe `.akrctx/upgrades/.gitignore` con el contenido
  `*` y `!.gitignore`, igual que `.akrctx/local/.gitignore`.
- `akrctx upgrade` escribe ese mismo archivo en una instalación existente que
  no lo tenga.
- El `.gitignore` raíz del proyecto no se modifica.
- Tras un `akrctx upgrade` que cubre todos los targets, los archivos bajo
  `.akrctx/upgrades/<CLI_VERSION>/` que ese run no ha escrito quedan borrados.
- Un candidato sin resolver sobrevive al borrado, porque el mismo run lo
  reescribe.
- Un run con `--target <uno>` no borra ningún candidato.
- `--dry-run` no borra nada y anuncia lo que borraría.
- Los directorios de versiones anteriores a `CLI_VERSION` no se tocan.
- El propio `.akrctx/upgrades/.gitignore` nunca se borra en la limpieza.
- `akrctx doctor` reporta el ignore ausente o debilitado y lo repara con
  `--fix`.
- La salida del CLI distingue el borrado de los demás tipos de escritura.
