# Contrato TASK-067 (P05)

Fuente: `.akrctx/tasks/TASK-063-verification-and-workflow-contract/design.md`.
Alcance confirmado por el usuario el 2026-09-07: P05 completo, con sufijo `# optional` explícito.

## Estado actual medido

- `readValidationDeclaration` (`src/judge-enforcement.ts:393-414`) devuelve `{ sectionPresent, commands }`.
  Descarta líneas vacías y líneas que **empiezan** por `#`. No trata comentarios finales de línea.
- `verifyJudgeRecord` (`src/judge-enforcement.ts:270-282`) acepta APPROVED con **una** coincidencia:
  la condición de rechazo es `declaredAndPassing.length === 0`.
- `--run-tests` reejecuta sólo `declaredAndPassing` (`:284-326`).
- Snapshot: `contentDigest` sin `stat`; `workspaceDigest` añade `statOf`, que hashea sólo `ctimeMs`
  (`src/judge-snapshot.ts:913-938`). Se persisten en `:572-573` y se comparan al cargar (`:230-235`).
- `checkJudgeSnapshotCurrentState` (`src/judge-snapshot.ts:300-334`) devuelve
  `CURRENT | NEWER_CHANGES | DIVERGED` en un único eje.
- Pruebas: todo vive en `tests/akrctx.test.ts`, bloque `describe("judge")` (`:2933-5265`, 120 tests).

## W1 — Declaración por comando y verificación completa

### Sintaxis

Dentro de la valla del bloque `## Validation`:

1. Una línea que termina con `# optional` es un comando **opcional**. El marcador se reconoce con
   `/\s+#\s*optional\s*$/i` y se retira antes de normalizar el comando.
2. Cualquier otra línea no vacía que no empiece por `#` es un comando **obligatorio**.
3. No se retira ningún otro comentario final. Un comando que hoy termina en otro texto conserva
   su identidad literal. Esto evita que una cápsula existente cambie de significado.
4. Una única línea `no-runtime-validation: <razón>` declara `kind` distinto de `runtime`. Sólo vale
   si es la única línea de la valla y la razón no está vacía. Produce `kind: "documentation"` y
   `currentStatus: "not-applicable-to-runtime"`.

### Tipo

`ValidationDeclaration` gana `checks: Array<{ command: string; required: boolean }>` y
`kind: "runtime" | "documentation"` y `reason: string | null`. El campo `commands` se conserva con
su significado actual: todos los comandos, obligatorios y opcionales, en orden y deduplicados.

### Regla de puerta para APPROVED

- Sea `R` el conjunto de comandos obligatorios declarados.
- `R` no vacío: **todo** comando de `R` debe aparecer en `tests` con `status: "passed"`. Si falta
  alguno, la razón nombra exactamente los que faltan. Ésta sustituye a la regla de una coincidencia.
- Un comando obligatorio con `status: "failed"` o `"not-run"` es razón, nunca se oculta tras otros.
- Un comando **opcional** fallido produce un `notice`, no una razón.
- Un comando fallido no declarado sigue siendo razón. El comportamiento conservador no se relaja.
- `sectionPresent` con valla vacía o malformada mantiene la razón actual de cápsula sin terminar.
- Sin sección `## Validation`: legacy. `currentStatus: "unknown"` en `verifiedNow`. `approved`
  conserva su veredicto histórico.
- `kind: "documentation"` exige cero comandos y razón no vacía. No afirma haber verificado código.

### Reejecución

El conjunto a reejecutar sigue siendo `declaredAndPassing`. Bajo la puerta estricta ese conjunto ya
contiene todos los obligatorios, así que la cobertura completa se obtiene sin ampliar la superficie
de aprobación de órdenes. No se ejecuta nada fuera de la lista declarada.

## W2 — Identidad de contenido en el snapshot

Se añaden dos campos a los metadatos del snapshot, con subida de versión de schema del snapshot.
Los campos antiguos conservan su significado exacto; no se renombran ni se reutilizan.

| Campo | Qué identifica | Incluye `ctime` | Viaja entre checkouts |
| --- | --- | --- | --- |
| `contentDigest` | bytes del workspace capturado | no | no cambia (existente) |
| `workspaceDigest` | integridad de esa captura local | sí | no (existente) |
| `reviewContentDigest` | identidad portable de lo revisable | no | sí (nuevo) |
| `reviewWorkspaceDigest` | integridad local de lo revisable | sí | no (nuevo) |

Ambos digests nuevos se calculan sobre el manifiesto **excluyendo** el sidecar de continuación
válido. Ésa es la exclusión estrecha. Forman la pareja de lo revisable: `reviewContentDigest` es
identidad portable y `reviewWorkspaceDigest` es integridad local del mismo subconjunto.

`workspaceDigest` sigue abarcando el manifiesto completo, así que alterar el sidecar dentro de la
captura inmutable rompe la integridad igual que antes. Un `reviewWorkspaceDigest` calculado sobre
el manifiesto completo sería numéricamente idéntico a `workspaceDigest` y por tanto redundante.

## W3 — Dos ejes de revisión y presentación

### Qué cuenta como metadata de ejecución

Sólo `<taskRoot>/continuation.json` cuando es un archivo regular y `readTaskContinuation` devuelve
`status: "valid"`. Un sidecar ausente, irregular, inválido o no soportado **no** se excluye: sigue
siendo un archivo ordinario dentro de la frontera de revisión.

### Ejes

`checkJudgeSnapshotCurrentState` devuelve dos ejes además del `status` actual, que se conserva
para compatibilidad:

- `reviewBoundary`: `CURRENT | NEWER_CHANGES | DIVERGED`, calculado ignorando el sidecar válido.
- `executionMetadata`: `ABSENT | UNCHANGED | CREATED | REMOVED | ADVANCED`.

Si el contenido revisable coincide, el código queda `CURRENT` aunque el sidecar se haya creado,
borrado o actualizado. Actualizar el sidecar nunca transfiere permiso ni reanuda nada: exige
reconciliación explícita.

### Dentro del snapshot inmutable

Alterar el sidecar dentro de la captura cambia `workspaceDigest` y `reviewWorkspaceDigest`. La carga
falla por integridad. Una recaptura no hereda automáticamente la aprobación anterior.

### Presentación

El resultado de `verifyJudgeRecord` separa los dos hechos:

- `historicalVerdict`: `value`, `independence`, `scopeDigest`, `codeReviewContentDigest`.
- `verifiedNow`: `value`, `reason`, `reviewBoundary`, `executionMetadata`.

`independent` ausente vale `unknown`, nunca `true` y nunca autenticidad.

## Límites

No se introduce emisor ni raíz de confianza. Un digest local no es autenticidad. No se toca el
clasificador de workflow (P14a) ni el Doctor operativo (P14b). No se migra ninguna cápsula
existente de forma automática.
