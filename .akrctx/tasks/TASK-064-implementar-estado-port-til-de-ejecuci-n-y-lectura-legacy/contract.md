# Contrato de implementación P02

## Superficie

src/continuation.ts exporta tipos v1, CONTINUATION_SCHEMA_VERSION=1, CONTINUATION_MAX_BYTES=65536, validateContinuation(value: unknown) (devuelve razones de schema, sin lanzar por input inválido), readTaskContinuation(cwd, taskId). El lector devuelve {taskId, path, status, executionState, permission: "not-evaluated", verification: "not-evaluated", continuationDigest, record, reasons}. status: missing|valid|invalid|unsupported; digest/record null salvo valid. executionState: estado declarado si valid, unknown en otro caso. path relativa POSIX del único taskRoot/continuation.json. continuationDigest es sha256 de bytes originales, no un digest de código ni identidad autenticada. Reasons son mensajes estructurales, sin volcar valores ni contenido inválido.

CLI task continuation <taskId> --json imprime ese objeto. missing/valid exit normal. invalid/unsupported también imprime el objeto en JSON y fija exitCode=1; terminal muestra estado/razones, siempre indica que permisos y verificación no se evaluaron. No imprime el cuerpo entero del sidecar en terminal. Errores de acceso/ID/raíz lanzan error por el mecanismo habitual del CLI y no se convierten en legacy missing.

## Resolución y lectura

ID estricto ^TASK-[0-9]+$. Resolver exactamente un directorio TASK-ID o TASK-ID-<slug>, rechazar duplicados. Rechazar symlinks en .akrctx, tasks, directorio de tarea, policy.json y sidecar; no seguir archivos bloqueados por policy ni leer secretos. Leer blockedReadPatterns antes del sidecar (validando previamente que la política es archivo regular). Reutilizar semántica de patrones existente. Exigir raíces/directorios reales y cinco archivos canónicos presentes para resolver una cápsula NO es necesario: legacy incompleta sigue siendo consultable.

Ausencia de sidecar en una tarea existente devuelve missing/unknown sin escribir. Raíz o tarea inexistente: error. Archivo no regular, symlink, error de permisos: error explícito. Oversize, JSON inválido o schema inválido: invalid. Version numérica entera distinta de 1: unsupported, sin intentar interpretar o migrar. Lectura limitada a MAX_BYTES+1 mediante descriptor, validar archivo regular y O_NOFOLLOW donde el host lo permita; evitar cargar contenido arbitrariamente grande. No prometer resistencia a reemplazo adversarial concurrente de todos los directorios, pero no seguir symlinks estáticos ni symlink final sustituido antes del open.

## Schema v1 estricto

Sin claves adicionales en ningún objeto. Todos los campos enumerados son obligatorios salvo indication expresa. Limitar cualquier string libre a 1024 caracteres, arrays a 100 elementos, history a 20. Identificadores: run_ y budget_ seguidos por 1–80 caracteres ASCII alfanuméricos/guion/underscore. Digests sha256: + 64 hex minúsculas. Commit null o 40/64 hex minúsculas. No coerción de tipos. JSON raíz objeto no array.

Raíz: {schemaVersion:1, task, latestExecution, history}.
Task: {taskId, capsulePath, capsuleDigest, capsuleRevision:{gitCommit}}. capsuleDigest digest válido; capsulePath exactamente el directorio resuelto cuando se lee. Validación pura exige ruta POSIX .akrctx/tasks/TASK-ID[-slug] sin segmentos dot, barras finales o backslash y coherente con taskId. Reader comprueba también identidad solicitada. No calcular vigencia de capsuleDigest todavía.
LatestExecution: null o Execution.
Execution: {runId, state, workspace, owner, model, progress, blockers, decisionsPending, attempts, validationSummary, resumption}.
State: planned|ready|active|blocked|handoff-requested|completed|abandoned|superseded. Leer active sólo informa un estado declarado; no lo recupera ni autoriza.
Workspace: {gitRemote, commit, content}; gitRemote string "unknown" o identificador no sensible suministrado por operador, nunca se obtiene automáticamente. content: {kind:"unavailable"} o {kind:"judge-snapshot", snapshotId, reviewContentDigest, availability:"verified"|"unavailable"}. snapshotId: SNAPSHOT: seguido de 1–128 ASCII alfanuméricos/guion/underscore. availability es DECLARACIÓN DEL PRODUCTOR, no conclusión del lector. Nunca incluir reviewWorkspaceDigest portable.
Owner: {kind:"orchestrator"|"manual-session", id:string}. Model: {requested:string, observed:string}; unknown literal permitido, no inferir valores.
Progress/blockers/decisionsPending: arrays de strings resumidos.
Attempts: {budgetAccountId, consumed, limit, provenance, localReconciliation}. consumed entero seguro >=0 o "unknown"; limit entero seguro >=1. consumed puede superar limit (histórico agotado), no truncar. provenance: portable-summary|legacy-local-log|unknown. localReconciliation: not-available|reconciled|conflict. El lector conserva estas declaraciones, NO reconcilia ni reinicia cuenta.
ValidationSummary: {contractDigest, codeReviewContentDigest, required, status}. contractDigest digest; codeReviewContentDigest digest o null; required array de {command:string, status:passed|failed|not-run}; status unknown|incomplete|complete|not-applicable-to-runtime. Son resúmenes declarados, nunca se convierten en verifiedNow. Para complete exigir required no vacío, todos passed y codeReviewContentDigest no null. Para not-applicable-to-runtime exigir required vacío y campo adicional obligatorio reason:string no vacío (única variante que admite reason). No ejecutar los comandos ni repetirlos automáticamente.
Resumption: {requiresReauthorization:true, reason:string no vacío}. No aceptar false.
History: array de Execution con state terminal (completed|abandoned|superseded), runIds únicos y distintos del latestExecution. No truncar al leer; exceso es invalid. No persistir grants, aprobaciones, paths absolutos de sesión, logs ni credenciales: claves de ese tipo rechazadas por schema cerrado. No afirmar que un validador puede detectar secretos arbitrarios en texto libre; responsabilidad del productor, documentada.

## Evolución

No generar continuation.json durante init/task/create/upgrade. No añadirlo a neutralRequired ni capsuleFiles: es dato opcional del usuario, no archivo distribuido por el harness. Schema/types permanecen en código con ejemplo documentado y tests. No modificar permisos/review ni generar modelos falsos. TASK-067 reutilizará el lector/digest de metadata antes de crear exclusiones; no asumir que status valid significa trusted, CURRENT o APPROVED.
