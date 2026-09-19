# Log de implementación

## Preparación

El agente principal escribió el contrato (`contract.md`) a partir del diseño de TASK-063 (P05).
El contrato fijó la sintaxis, los tipos y la regla de puerta antes de repartir el trabajo.

El principal dividió la implementación en tres paquetes, W1, W2 y W3, en orden de dependencia.
Cada paquete cubre un subconjunto cerrado de criterios de aceptación.

- W1 implementa AC1 a AC4: declaración por comando y verificación completa.
- W2 implementa AC5 y AC6: nueva identidad de contenido en el snapshot.
- W3 implementa AC7 a AC10: los dos ejes de revisión y su presentación separada.

AC11 y AC12 no son de un solo paquete. Cubren la superficie de pruebas y la ejecución completa
de la suite, y se comprobaron al final contra el trabajo de los tres paquetes.

## W1 — Declaración por comando y verificación completa

`readValidationDeclaration` reconoce ahora el sufijo `# optional` al final de línea y lo retira
del comando. Toda otra línea no vacía que no empiece por `#` queda marcada como obligatoria.
Ningún otro comentario final se retira.

`ValidationDeclaration` gana `checks: Array<{ command; required }>`, `kind: "runtime" |
"documentation"` y `reason: string | null`. `commands` conserva su significado: todos los
comandos, obligatorios y opcionales, en orden y deduplicados.

`verifyJudgeRecord` exige ahora que todos los comandos obligatorios declarados aparezcan con
`status: "passed"`. La razón de rechazo nombra exactamente los que faltan. Un obligatorio
`failed` o `not-run` sigue siendo razón. Un opcional fallido produce un `notice`, no una razón.
Un comando fallido no declarado sigue siendo razón, sin cambios.

Una línea única `no-runtime-validation: <razón>` produce `kind: "documentation"` y
`currentStatus: "not-applicable-to-runtime"`. Una cápsula sin sección `## Validation` queda
`unknown` y nunca alcanza aprobación plena.

El principal corrigió dos defectos durante la revisión de W1:

1. El mensaje de rechazo no nombraba los comandos obligatorios que faltaban con precisión.
2. El orden de evaluación de la cadena de razones no coincidía con la prioridad exigida por
   el contrato (obligatorio ausente antes que otras causas de rechazo).

## W2 — Identidad de contenido en el snapshot

El snapshot persiste dos campos nuevos: `reviewContentDigest` y `reviewWorkspaceDigest`. Ambos
excluyen el sidecar `continuation.json` cuando es un archivo regular y válido. `contentDigest` y
`workspaceDigest` conservan su valor y su significado exactos.

La versión de schema del snapshot sube de 6 a 7. Una captura v6 falla al cargar con un
diagnóstico explícito que pide recaptura.

El principal corrigió un defecto durante la revisión de W2: la primera versión de
`reviewWorkspaceDigest` cubría el manifiesto completo, igual que `workspaceDigest`, y por tanto
era numéricamente redundante. Se corrigió para cubrir sólo el subconjunto revisable, la misma
exclusión estrecha que `reviewContentDigest`.

## W3 — Dos ejes de revisión y presentación

`checkJudgeSnapshotCurrentState` publica ahora dos ejes además del `status` existente:
`reviewBoundary` (`CURRENT | NEWER_CHANGES | DIVERGED`), calculado ignorando el sidecar válido, y
`executionMetadata` (`ABSENT | UNCHANGED | CREATED | REMOVED | ADVANCED`). Crear, borrar o
actualizar el sidecar por sí solo mantiene `reviewBoundary` en `CURRENT` y mueve sólo el eje de
metadata.

Alterar el sidecar dentro de una captura inmutable sigue rompiendo la integridad, porque
`workspaceDigest` abarca el manifiesto completo sin excepción.

`verifyJudgeRecord` separa el resultado en `historicalVerdict` (`value`, `independence`,
`scopeDigest`, `codeReviewContentDigest`) y `verifiedNow` (`value`, `reason`, `reviewBoundary`,
`executionMetadata`). Un registro sin campo `independent` se lee como `unknown`, nunca `true`.

## Validación

| Orden | Resultado |
| --- | --- |
| `pnpm exec vitest run tests/akrctx.test.ts` | 404 tests, todos correctos |
| `pnpm build` | ESM y DTS generados sin errores |
| `pnpm test` | 920 tests en 9 archivos, todos correctos |
| `pnpm lint` | biome, 99 archivos, sin correcciones necesarias |
| `pnpm akrctx doctor --json` | readiness 100, sin `missing` ni `conflicts` |

## Plantilla y límite de refresco

La regla nueva obligó a corregir el texto de la plantilla del bloque `## Validation`, que aún
describía la regla vieja de una sola orden. Se corrigió en `src/task.ts` y en
`src/templates/wiki.ts`.

`akrctx task` genera la cápsula desde `src/task.ts` en tiempo de ejecución, así que toda cápsula
nueva ya nace con el texto correcto. La copia de referencia instalada en
`.akrctx/tasks/_template/task.md` es otro artefacto: sólo se reescribe cuando `akrctx upgrade`
detecta un cambio de versión del CLI. Con 0.6.0 a 0.6.0 el plan de upgrade queda vacío, así que
esa copia sigue mostrando el texto anterior hasta la próxima publicación.

Defecto encontrado de paso, fuera del alcance de esta cápsula: `akrctx upgrade --help` anuncia la
opción `--force`, pero el comando la rechaza con "never force-overwrites files; remove --force".
La ayuda y el comportamiento no coinciden.

## Revisión independiente, ronda 1

Veredicto: NEEDS CHANGES sobre `SNAPSHOT:a90946e84eb9fe355c05`, base `7b4932f`, con `TASK-064`
incluida por autorización explícita. Las cinco órdenes declaradas pasaron. El registro vive en
`.akrctx/local/judge/TASK-067-review.json`.

Dos defectos, ambos ciertos:

1. Regresión introducida por el principal al reestructurar la cadena de razones en W1. Se perdió la
   guarda que exigía que alguna orden declarada hubiera pasado. Con todas las órdenes marcadas
   `# optional` el conjunto obligatorio queda vacío, y una orden inventada satisfacía la regla de
   evidencia. El juez lo midió en su copia desechable en vez de deducirlo. Corregido: se restauró
   la guarda y se añadió la prueba que lo cubre.
2. Tres superficies de instrucciones del juez seguían describiendo la regla de una sola orden:
   `src/templates/judge.ts`, `src/templates/judge-contract.ts` y `docs/JUDGE.md`. Se regeneran hacia
   proyectos consumidores con `akrctx upgrade`. Corregidas las tres, conservando la garantía de la
   orden inventada y documentando `# optional` y `no-runtime-validation:`.

El primer defecto es el modo de fallo propio de endurecer una puerta: una rama sin cubrir deja el
resultado más laxo, no más estricto.

## Inestabilidad observada en la suite, sin causa demostrada

`pnpm test` falló dos veces durante esta sesión en el proyecto vivo, con un test de 922. Las dos
veces la ejecución siguiente pasó limpia.

- Fallo 1: tras añadir texto a este `log.md` con un heredoc en la misma invocación de shell.
- Fallo 2: tras añadir la valla vacía a `.akrctx/tasks/_template/task.md`, también en la misma
  invocación. El reportero mostró `Tests 1 failed | 921 passed (922)`.

No se capturó el nombre del test que falló en ninguno de los dos casos. Después se ejecutaron seis
suites limpias seguidas, incluida una prueba deliberada que reescribía un archivo bajo `.akrctx/`
con contenido idéntico, para cambiar su `ctime`, e inmediatamente lanzaba la suite. No reprodujo.

La hipótesis de que una escritura reciente bajo `.akrctx/` interfiere con un test que lee el
repositorio vivo NO está confirmada. El juez de la ronda 2 tampoco observó inestabilidad, pero
ejecutó en copia aislada sin escritor concurrente, así que su resultado no la refuta.

Queda como asunto abierto. Un test inestable en la maquinaria de verificación resta valor a toda
afirmación de que la validación pasó.

## Defecto encontrado en `akrctx judge enable --force`

Fuera del alcance de esta cápsula. Se registra para abrir cápsula propia.

`pnpm akrctx judge enable --force` regeneró los dos archivos de agente como estaba previsto, pero
además borró la sección `candidates` completa de `.akrctx/manifest.json`. Perdió la procedencia de
`.akrctx/upgrades/0.6.0/CLAUDE.md` y `.akrctx/upgrades/0.6.0/AGENTS.md`, dos archivos que siguen
existiendo en disco. TASK-056 centralizó precisamente esa procedencia.

Agrava el caso que `judge enable --force --dry-run` no anuncia ninguna escritura sobre
`.akrctx/manifest.json`. El plan en seco listó dos archivos; la ejecución real tocó tres.

El dato se restauró a mano desde `HEAD`. El diff del manifiesto queda reducido a los dos hashes de
agente que sí corresponden a esta regeneración.

## Revisión independiente, rondas 2 a 4

Ronda 2, `SNAPSHOT:f7c16d036b7b940ff6a4`: NEEDS CHANGES con tres defectos. `docs/JUDGE.md` se
contradecía entre sus viñetas nuevas y su tabla. Tres superficies instaladas y versionadas seguían
con la regla vieja, demostrado con el historial de los seis commits anteriores que sí las
regeneraron. Y el bucle de fallos, introducido en W1, emitía una razón idéntica y sin nombre por
cada test fallido. Corregidos los tres; el mensaje de fallo ahora nombra las órdenes en una línea.

Ronda 3, `SNAPSHOT:9d1a6b088da3d227a39e`: NEEDS CHANGES con un defecto. La documentación afirmaba
que una cápsula legacy nunca alcanza `APPROVED`, y el código le daba `approved: true` con
`verifiedNow: unknown`. El usuario decidió que ceden los documentos. Ver `### Session 2026-09-08`.

Ronda 4, `SNAPSHOT:993d1752412de10fa22c`: NEEDS CHANGES con dos defectos de una línea. `CHANGELOG.md`
era la quinta superficie con la afirmación retractada, y no estaba en la lista de cuatro que se
corrigió. El manifiesto conservaba el hash antiguo de `.akrctx/judge/README.md`, sincronizado a mano
después de que `judge enable --force` recalculara el manifiesto. Sin ese hash, el siguiente upgrade
habría tratado un archivo correctamente sincronizado como modificado por el usuario. Corregidos, y
se verificaron además los 100 archivos gestionados contra su hash: sin más deriva.

La ronda 4 corrigió a la ronda 3 en un punto: el comentario de `src/judge-enforcement.ts:526` sí
describe el código. Una cápsula legacy no declara órdenes, así que sólo aplica "cualquier orden
pasada". La ronda 4 añadió un dato que ninguna anterior vio: por la vía `--run-tests`, que es la
que el llamador de confianza debe usar, ese hueco ya está cerrado.

## Revisión independiente, ronda 5: aprobada

`SNAPSHOT:e286436cf5eb94dc7660`, `scopeDigest sha256:42c69906…`. APPROVED sin issues. El juez
recomputó por su cuenta el hash de los 26 archivos gestionados y de los dos candidatos ignorados por
Git, e importó los generadores para comparar su salida byte a byte con los archivos instalados.

Examinó y descartó un sexto candidato a superficie: el `task.md` de esta misma cápsula conserva el
texto anterior en su bloque de plantilla. No es defecto. La prosa de una cápsula es registro
histórico, no documentación normativa; el contrato excluye migrar cápsulas existentes; y el parser
lee sólo el contenido de la valla, nunca la prosa que la rodea.

`akrctx judge verify --run-tests` informó APPROVED and current, con `verifiedNow: complete` y las
cinco órdenes reejecutadas por el llamador de confianza. La salida separa los dos ejes y avisa de
las tres preguntas abiertas. La verificación completa quedó comprobada sobre sí misma.

Cinco rondas. Ninguna repitió un hallazgo de otra.
