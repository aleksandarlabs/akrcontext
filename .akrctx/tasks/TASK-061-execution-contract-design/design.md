# Diseño: contrato de ejecución y continuación

## Decisión y límites

**Decisión confirmada (2026-09-06).** Una cápsula sigue siendo sus cinco documentos
versionados. El estado portátil será un único archivo de continuación versionado,
`continuation.json`, dentro del directorio de la cápsula y fuera de esos cinco documentos.
Transporta un resumen para decidir si se puede continuar; no transporta una sesión ni permite
continuar automáticamente una autorización.

No es una implementación. Hoy `src/task.ts` sólo crea los cinco documentos, `src/impl.ts`
escribe rondas locales y `src/compile.ts` no empaqueta estado de ejecución. Esta fase define el
contrato para P02--P04. El archivo no entra en `taskDigest`, pero eso por sí solo **no** basta:
hoy también cambia `changeDigest` y el manifiesto de un snapshot. La frontera futura debe tratar
esa ruta de forma explícita; el resumen viaja con la cápsula para evitar reinventar qué se intentó.

## Frontera de revisión y continuación

La frontera tiene dos capas con resultados independientes:

| Capa | Incluye | Afecta a `APPROVED` / verificación de código | Resultado al cambiar |
| --- | --- | --- | --- |
| `reviewBoundary` | Cinco documentos y todos los archivos de código/diff habituales | Sí | La aprobación actual queda obsoleta y necesita nueva frontera. |
| `executionMetadata` | Sólo el archivo regular `<taskRoot>/continuation.json` | No | La aprobación histórica de código permanece; la continuación queda `advanced` y se reconcilia al reanudar. |

No se excluye indiscriminadamente el directorio de la cápsula: las cinco especificaciones, sus
exports y cualquier archivo distinto siguen las reglas normales de `changeDigest` y del snapshot.
P02/P05 reconocerán exclusivamente la ruta literal resuelta desde el único `taskRoot`, rechazarán
symlinks, tamaño/esquema no válidos y no permitirán configurar comodines para ignorar otros
archivos.

La captura guarda aparte `continuationDigest` y su presencia/ausencia. Para no reinterpretar los
snapshots actuales, P05 versionará el metadato y añadirá dos digests de revisión con finalidades
distintas:

| Digest | Qué compara | Dónde se compara | ¿Puede cruzar checkout? |
| --- | --- | --- | --- |
| `reviewContentDigest` | Rutas y bytes revisables, con la única exclusión estructural del sidecar | Capturas, checkouts y reanudación | Sí |
| `reviewWorkspaceDigest` | La misma captura local completa, incluido sidecar y `ctime` de su manifiesto | Sólo contra el valor guardado por esa captura | No |

Los `contentDigest`/`workspaceDigest` completos del snapshot siguen describiendo la captura
inmutable entera. Al comprobar actualidad se informan ambos ejes, por ejemplo
`reviewBoundary: CURRENT` y
`executionMetadata: ADVANCED`. Sólo el primero decide si un juicio de código sigue vigente. Si el
sidecar falta, está corrupto o no puede leerse, el juicio histórico no se borra, pero la
reanudación queda bloqueada: `continuation: unavailable`. Esta excepción estrecha requiere pruebas
de que una actualización exclusiva de `continuation.json` en el repositorio activo no cambia
`changeDigest`, `scopeDigest` ni `reviewContentDigest`, incluida escritura temporal con `rename`,
y de que cualquier otra ruta sí los cambia. Otra prueba debe alterar el sidecar dentro de un
snapshot y confirmar el fallo de integridad local.

Los cambios en el **repositorio activo** no modifican el directorio del snapshot inmutable. Por
tanto, si `reviewContentDigest` coincide, editar, crear, borrar o reemplazar atómicamente mediante
archivo temporal y `rename` el sidecar deja `reviewBoundary: CURRENT`; sólo cambia
`executionMetadata` a `ADVANCED`, `CREATED` o `REMOVED`. La reanudación puede quedar bloqueada si
esa metadata falta o es inválida, pero no se declara una modificación de código.

Los cambios **dentro del snapshot inmutable** son otro caso. Su `reviewWorkspaceDigest` conserva
el `ctime` del padre y del sidecar para detectar incluso escritura-restauración, alta/baja o
`rename`. Si no coincide con el registro de *ese mismo snapshot*, la carga falla por integridad.
Recapturar produce una captura nueva; no transfiere automáticamente el `APPROVED` del snapshot
alterado, que sigue siendo sólo un hecho histórico de su frontera original.

## Propiedad de datos

| Dato | Ubicación propuesta | ¿Viaja con Git? | Consecuencia |
| --- | --- | --- | --- |
| Intención, alcance y criterios | Cinco Markdown canónicos | Sí | Forman el contrato y su digest. |
| Resumen reanudable | `continuation.json` versionado | Sí | Tiene digest y actualidad propios; sus referencias se verifican antes de uso. |
| Rondas detalladas, salida y conversaciones | `.akrctx/local/impl/` | No | Informan, pero no se presuponen disponibles. |
| Snapshots, procesos y reservas activas | `.akrctx/local/` | No | No se copian ni reactivan en un handoff. |
| Credenciales, permisos y consentimientos | Orquestador/local | No | Nunca aparecen en la cápsula ni se heredan. |

El archivo portable puede decir que falta evidencia o existe un bloqueo, pero no contiene texto
de logs, tokens, URLs privadas, secretos ni aprobaciones. Si un resumen los requeriría, usa una
razón no sensible: `"local evidence unavailable"`.

## Forma de los datos

Los ejemplos son contrato de diseño. `null` y `unknown` son información honesta, no valores que
se puedan completar por inferencia.

### Tarea estable

```json
{
  "taskId": "TASK-061",
  "capsulePath": ".akrctx/tasks/TASK-061-execution-contract-design",
  "contract": {
    "digest": "sha256:…",
    "files": ["task.md", "context.md", "plan.md", "acceptance-criteria.md", "review-checklist.md"],
    "revision": { "gitCommit": "a1b2c3…" }
  }
}
```

`digest` se calcula sobre los cinco archivos en el orden canónico, igual que el juicio actual.
`gitCommit` sólo facilita navegación por Git: no identifica el contenido de código si existen
cambios sin commit. La identidad de código se expresa con un snapshot íntegro cuando exista; sin
él se dice `unavailable`, no se fabrica un hash parcial.

### Archivo de continuación portable

```json
{
  "schemaVersion": 1,
  "task": {
    "taskId": "TASK-061",
    "capsulePath": ".akrctx/tasks/TASK-061-execution-contract-design",
    "capsuleDigest": "sha256:…",
    "capsuleRevision": { "gitCommit": "a1b2c3…" }
  },
  "latestExecution": {
    "runId": "run_01J…",
    "state": "blocked",
    "workspace": {
      "gitRemote": "unknown",
      "commit": "d4e5f6…",
      "content": {
        "kind": "judge-snapshot",
        "snapshotId": "SNAPSHOT:abc…",
        "reviewContentDigest": "sha256:…",
        "availability": "verified"
      }
    },
    "owner": { "kind": "orchestrator", "id": "unknown" },
    "model": { "requested": "gpt-5.6-terra", "observed": "unknown" },
    "progress": ["AC1--AC4 designed", "implementation not started"],
    "blockers": ["Await independent review of this design."],
    "decisionsPending": [],
    "attempts": {
      "budgetAccountId": "budget_01J…",
      "consumed": 0,
      "limit": 3,
      "provenance": "portable-summary",
      "localReconciliation": "not-available"
    },
    "validationSummary": {
      "contractDigest": "sha256:…",
      "codeReviewContentDigest": "sha256:…",
      "required": [],
      "status": "not-applicable-to-runtime"
    },
    "resumption": { "requiresReauthorization": true, "reason": "portable state carries no grant" }
  },
  "history": []
}
```

Hay una ejecución vigente y un historial resumido, acotado y redactable. No es una cola de
trabajos ni un diario exhaustivo. Cada implementación fijará límites de tamaño y retención antes
de escribirlo.

### Intento y traspaso

Un intento es distinto de una reserva y de una sesión:

```json
{
  "attemptId": "attempt_01J…",
  "runId": "run_01J…",
  "number": 2,
  "state": "completed",
  "startedAt": "2026-09-06T10:00:00Z",
  "finishedAt": "2026-09-06T10:12:00Z",
  "criteria": ["AC3"],
  "outcome": "blocked",
  "localDetails": "not-portable"
}
```

Un traspaso propone continuar una ejecución concreta y exige comprobación:

```json
{
  "fromRunId": "run_01J…",
  "to": { "kind": "manual-session", "id": "unknown" },
  "carried": ["task identity", "progress", "blockers", "attempt count", "validation summary"],
  "notCarried": ["authorization", "approval", "local logs", "snapshot", "reservation", "credentials"],
  "comparison": {
    "capsuleDigest": "match",
    "codeContent": "different",
    "continuation": "advanced",
    "workspace": "different-checkout",
    "evidence": "stale"
  },
  "result": "requires-reconciliation-and-authorization"
}
```

## Estados y recuperación

`runId` identifica una ejecución recuperable; no identifica modelo, conversación ni directorio.
El propietario identifica coordinación, no acredita autoría. El estado persistido describe lo que
ocurrió; el permiso efectivo sólo responde si puede actuar **ahora** y siempre vive localmente en
el orquestador.

| Estado persistido | Significado | Transiciones persistidas permitidas |
| --- | --- | --- |
| `planned` | Hay intención, sin estado contrastado. | `ready`, `abandoned`, `superseded` |
| `ready` | Referencias y presupuesto reconciliados; no presupone permiso. | `active`, `blocked`, `handoff-requested`, `abandoned`, `superseded` |
| `active` | Se comenzó un intento durable. | `blocked`, `handoff-requested`, `completed`, `abandoned`, `superseded` |
| `blocked` | Falta decisión, recurso, identidad o validación. | `ready`, `abandoned`, `superseded` |
| `handoff-requested` | Se cerró/recuperó una sesión y debe compararse antes de seguir. | `ready`, `blocked`, `abandoned`, `superseded` |
| `completed` / `abandoned` / `superseded` | Terminales. `completed` no equivale a `APPROVED`; `superseded` conserva el run sustituido. | Ninguna |

La evaluación local de permiso devuelve `granted`, `expired`, `out-of-scope` o `not-evaluated`.
Sólo `ready + granted` permite persistir `active`; `granted` no se serializa en
`continuation.json`. Tras una caída, un `active` leído se transforma mediante un evento de
recuperación en `handoff-requested`, no vuelve a trabajar silenciosamente. Un cambio de contrato
de cápsula termina el run anterior como `superseded` y crea sucesor; un cambio sólo de código
deja el run en `blocked` hasta reconciliar identidad y validación.

Antes de reanudar se comprueba esquema, `taskId` y ruta únicos, digest de cinco documentos,
identidad de contenido del código, compatibilidad del workspace, intentos y referencias de
evidencia. El commit se compara como pista adicional, nunca como sustituto del contenido. El
resultado se clasifica, nunca se oculta:

| Escenario | Hecho local | Resultado portable |
| --- | --- | --- |
| Mismo agente, misma carpeta | Puede correlacionar logs locales. | Comprueba referencias y autorización vigente. |
| Dos sesiones, misma carpeta | Comparten archivos, no identidad ni permiso. | Requiere exclusión/reserva antes de paralelo. |
| Otro checkout, sin `.akrctx/local` | No hay logs, snapshots ni grants. | Conserva resumen; si falta el snapshot/contenido, `blocked` hasta recapturarlo o declararlo no disponible. |
| Mismo contenido, checkout/recaptura con `ctime` distinto | `reviewContentDigest` coincide; el workspace digest de cada captura difiere. | Identidad portable coincide; cada captura valida sólo su propio `reviewWorkspaceDigest`. |
| Mismo commit, cambios sin commit | El commit coincide, el digest de contenido/snapshot no. | Evidencia `stale`; no llama actual a la validación. |
| Edita, crea, borra o reemplaza con `rename` el sidecar activo | La frontera de código coincide; cambia metadata de ejecución. | `reviewBoundary: CURRENT`; `continuation: ADVANCED|CREATED|REMOVED`; reconciliar antes de reanudar. |
| Altera sidecar dentro del snapshot | Cambia la captura y puede cambiar `ctime` de `taskRoot` del snapshot. | Fallo de integridad; una nueva captura no hereda el `APPROVED` anterior. |
| Caída tras escribir intento | Usa último estado durable. | `active → handoff-requested`; si consumo es ambiguo: `blocked`, no conjetura. |

Un mismatch de digest o contenido no borra historial: lo muestra como histórico y marca evidencia
`stale`. Igualdad de commit no autentica emisor, no prueba contenido ni concede consentimiento.

## Intentos, presupuesto y concurrencia

Se preserva TASK-043: `akrctx impl start` es informativo, no reserva ronda ni consume
presupuesto. `impl log` sigue siendo el registro legacy que consume localmente. La cuenta de
presupuesto se identifica por `budgetAccountId`, no por `runId`: un sucesor creado por cambio de
cápsula hereda consumo y límite de la cuenta anterior. Sólo una ampliación explícita autorizada
crea una cuenta nueva o eleva el límite; cambiar progreso administrativo o crear un `runId` no
reinicia intentos.

| Fuentes disponibles al reanudar | Valor de consumo | Acción |
| --- | --- | --- |
| Resumen portable válido, sin log local | Conserva `consumed` y `provenance: portable-summary`. | Puede continuar, sujeto a reserva y permiso. |
| Log local válido, sin resumen portable | Deriva `consumed` de rondas con `provenance: legacy-local-log`. | Continúa sólo en ese workspace; otro checkout verá `unknown`. |
| Ni resumen ni log | `unknown`, nunca cero. | Bloquea un nuevo intento hasta reconciliación explícita. |
| Resumen y log iguales | Conserva contador y marca `reconciled`. | Continúa. |
| Resumen y log incompatibles | Conserva ambos valores y marca `conflict`. | Bloquea; el orquestador/usuario decide cuál es el ledger. |

`portable-summary` es una declaración durable y transportable, no prueba criptográfica de quién
la escribió ni una autorización. Un orquestador con ledger propio puede corroborarla; sin ese
origen, la regla conservadora es no reducir consumo ni conceder una ronda nueva ante conflicto.

P03 definirá una reserva nueva: crear de forma atómica `(taskId, runId, attemptNumber)`, trabajar
sólo mientras siga vigente, confirmar o expirar con motivo observable, y devolver la misma
reserva en un reintento idéntico. Una solicitud diferente recibe conflicto, no otro intento.

La creación actual usa `max(TASK-ID)+1`, así que dos procesos pueden elegir el mismo ID. P03
usará creación exclusiva atómica y reenumeración tras colisión. Git no proporciona transacciones
entre clones: la exclusión inicial será local por workspace; coordinación entre hosts requiere
almacén/orquestador explícito posterior.

## Autoridad, aprobación y evidencia

| Concepto | Pregunta | ¿Cruza handoff manual? |
| --- | --- | --- |
| Autorización de ejecución | ¿Puede este run hacer estas acciones ahora? | No |
| Aprobación de revisión | ¿Alguien aprobó una frontera concreta entonces? | No como aprobación actual |
| Evidencia | ¿Qué se observó sobre qué frontera? | Sólo como referencia verificable |

Una autorización explícita puede abarcar agentes o sesiones **si el orquestador** conserva su
alcance y confirma que el siguiente miembro pertenece al mismo run. Copiar el repositorio o abrir
otra conversación no lo acredita. Un comando de validación nuevo o una acción fuera de alcance
amplía el plan y exige autorización; una acción ya expresamente incluida no pide permiso de nuevo.

TASK-054 sigue vigente: un hash local detecta manipulación, pero no autentica emisor ni transporta
permiso. La versión 1 no inventa recibos firmados.

## Alternativas y migración

| Alternativa | Portabilidad | Privacidad | Atomicidad | Decisión |
| --- | --- | --- | --- | --- |
| Sólo sidecar local | Nula entre checkouts | Buena | Sólo local | Rechazada: no resuelve handoff. |
| Continuación versionada | Viaja con cápsula | Buena si es resumen | Git no evita carreras | Elegida. |
| Servicio compartido | Alta | Depende de cuenta/retención | Puede reservar transaccionalmente | Posterior, no implícito. |

Una cápsula sin `continuation.json` es válida: ejecución `unknown`, no `not-started`. El lector
no reescribe esquemas que no entiende. Las hijas propuestas son P02 (schema y lectura legacy),
P03 (TASK-ID, reserva e idempotencia) y P04 (comparación/handoff). Cada una debe resolver su
escritura atómica, retención y comportamiento sin Git antes de código. No quedan preguntas de
producto para este diseño; no está aprobado sólo por estar redactado.
