# Acceptance Criteria

- AC-1: `akrctx init` escribe `.akrctx/upgrades/.gitignore` con el contenido
  `*` y `!.gitignore`, igual que `.akrctx/local/.gitignore`.
- AC-2: `akrctx upgrade` escribe ese mismo archivo en una instalación existente que
  no lo tenga.
- AC-3: El `.gitignore` raíz del proyecto no se modifica.
- AC-4: Tras un `akrctx upgrade` que cubre todos los targets, los archivos bajo
  `.akrctx/upgrades/<CLI_VERSION>/` que ese run no ha escrito quedan borrados.
- AC-5: Un candidato sin resolver sobrevive al borrado, porque el mismo run lo
  reescribe.
- AC-6: Un run con `--target <uno>` no borra ningún candidato.
- AC-7: `--dry-run` no borra nada y anuncia lo que borraría.
- AC-8: Los directorios de versiones anteriores a `CLI_VERSION` no se tocan.
- AC-9: El propio `.akrctx/upgrades/.gitignore` nunca se borra en la limpieza.
- AC-10: `akrctx doctor` reporta el ignore ausente o debilitado y lo repara con
  `--fix`.
- AC-11: La salida del CLI distingue el borrado de los demás tipos de escritura.
