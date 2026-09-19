# Acceptance Criteria

- AC1: El parser reconoce el sufijo `# optional` al final de línea y lo retira del comando. Toda
  otra línea no vacía que no empiece por `#` es obligatoria. Ningún otro comentario final se retira.
- AC2: `verifyJudgeRecord` exige que **todos** los comandos obligatorios declarados aparezcan con
  `status: "passed"`. La razón nombra exactamente los que faltan. La regla de una sola coincidencia
  desaparece.
- AC3: Un obligatorio `failed` o `not-run` es razón. Un opcional `failed` es notice y no invalida un
  conjunto obligatorio completo. Un comando fallido no declarado sigue siendo razón.
- AC4: Sin sección `## Validation` el estado es `verifiedNow: unknown`, porque no hay comandos
  declarados que comprobar. `approved` puede seguir siendo `true` como eje histórico del registro.
  Una valla vacía o malformada conserva la razón de cápsula sin terminar. `no-runtime-validation:
  <razón>` como línea única produce `kind: "documentation"` y `currentStatus:
  "not-applicable-to-runtime"`.
- AC5: El snapshot persiste `reviewContentDigest` y `reviewWorkspaceDigest` con versión de schema
  subida. `contentDigest` y `workspaceDigest` conservan su valor y su significado exactos.
- AC6: `reviewContentDigest` y `reviewWorkspaceDigest` excluyen el sidecar de continuación válido.
  `reviewContentDigest` es igual entre dos capturas del mismo contenido con `ctime` distinto;
  `reviewWorkspaceDigest` difiere entre esas dos capturas. Ninguno de los dos es numéricamente
  igual a `workspaceDigest` cuando hay sidecar válido.
- AC7: Sólo `<taskRoot>/continuation.json` regular y con `readTaskContinuation` en `status: "valid"`
  cuenta como metadata. Un sidecar ausente, irregular, inválido o no soportado permanece dentro de
  la frontera de revisión.
- AC8: Los ejes se publican por separado. Con contenido revisable igual, `reviewBoundary` es
  `CURRENT` y `executionMetadata` es `CREATED`, `REMOVED` o `ADVANCED` según el caso. El `status`
  de un solo eje se conserva para compatibilidad.
- AC9: Alterar el sidecar dentro de la captura inmutable rompe la integridad y la carga falla. Una
  recaptura no hereda la aprobación anterior.
- AC10: El resultado separa `historicalVerdict` de `verifiedNow`. `independent` ausente vale
  `unknown`, nunca `true` y nunca autenticidad.
- AC11: Pruebas cubren: cambios sin commit, contenido igual con `ctime` distinto, alta, baja,
  edición y `rename` del sidecar activo, alteración equivalente dentro del snapshot, sufijo
  `# optional`, obligatorio ausente, opcional fallido y cápsula legacy sin sección.
- AC12: `pnpm test` pasa entero. El test `akrctx.test.ts:3338` se actualiza para reflejar la regla
  estricta, no se borra. No se toca runtime fuera de judge y del lector de continuación.
