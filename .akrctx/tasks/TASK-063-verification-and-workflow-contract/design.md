# Diseño: verificación completa y proceso proporcional

## Decisiones confirmadas

1. Una entrega está **completamente verificada** sólo si todas sus validaciones obligatorias
   pasaron para la revisión actual de la cápsula y la versión concreta del código.
2. `not-run`, fallo, evidencia incompleta o una referencia distinta dejan la verificación actual
   incompleta; no se corrigen con una etiqueta optimista.
3. Investigación/documentación puede declarar explícitamente que no tiene validación de runtime.
   Eso no afirma haber verificado código.
4. Los veredictos históricos se conservan tal como fueron; se muestran aparte de lo verificado
   ahora. La evidencia legacy incompleta vale `unknown`.
5. La autorización pertenece a una ejecución explícitamente autorizada. Puede abarcar varios
   agentes o sesiones del orquestador, pero no cruza un handoff manual o una copia del repositorio.

Esta es investigación: no modifica `APPROVED`, comandos, prompts ni Doctor.

## Estado actual y brecha

| Área | Comportamiento actual | Contrato propuesto |
| --- | --- | --- |
| Validación para `APPROVED` | Exige una validación pasada y, si hay declaración, sólo una declarada. | Todas las obligatorias deben pasar. |
| Reejecución | Reejecuta la intersección de comandos declarados y reportados como pasados. | Reejecuta o invalida toda obligatoria reclamada. |
| Frontera | `taskDigest`, `changeDigest`, commits y snapshots se recomputan. | Conserva esto, clasifica `continuation.json` como metadata explícita y liga resultado a contenido exacto. |
| Independencia | `independent:false` es aviso; ausencia legacy significa true para el contrato actual. | Nunca se eleva a autenticidad; se muestra exactamente como declarada/desconocida. |
| Doctor | Mide instalación, ficheros, configuración, política, conflictos y wiki. | Mantiene ese diagnóstico como salud; preparación operativa es aparte y opt-in. |

La diferencia importante está en `verifyJudgeRecord`: hoy rechaza un fallo, pero con un
`APPROVED` basta una entrada pasada. Por tanto, una cápsula con `pnpm test` y `pnpm lint` puede
parecer aprobada aunque sólo se haya ejecutado una. Eso contradice la decisión de producto.

## Contrato propuesto de validación

Cada comando declarado tendrá identidad normalizada, clase y estado. La declaración forma parte
de los cinco documentos, así que cambiar obligatorios cambia `taskDigest` y obliga a revisar de
nuevo. `codeCommit` es sólo una referencia Git: la verificación completa necesita identidad de
contenido de un snapshot íntegro, también cuando existen cambios sin commit.

```json
{
  "contractDigest": "sha256:…",
  "codeIdentity": {
    "commit": "d4e5f6…",
    "snapshotId": "SNAPSHOT:abc…",
    "reviewContentDigest": "sha256:…",
    "availability": "verified"
  },
  "kind": "runtime",
  "checks": [
    { "id": "test", "command": "pnpm test", "required": true, "status": "passed" },
    { "id": "lint", "command": "pnpm lint", "required": true, "status": "not-run", "reason": "awaiting authorization" },
    { "id": "smoke", "command": "pnpm smoke", "required": false, "status": "not-run" }
  ],
  "currentStatus": "incomplete"
}
```

Reglas:

- `required: true` debe tener exactamente un resultado actual `passed` sobre el mismo digest de
  cápsula y el mismo `codeIdentity.reviewContentDigest` para que el estado sea `complete`. El
  commit coincide sólo como referencia adicional.
- `failed` o `not-run` de un obligatorio da `incomplete`; no queda oculto tras otros éxitos.
- Un opcional fallido se informa, pero no convierte por sí solo un conjunto obligatorio completo
  en incompleto; puede impedir un veredicto de calidad si la cápsula lo exige como criterio.
- Cero comandos es válido sólo con `kind: "documentation"` o `kind: "research"` y razón
  explícita. El estado se llama `not-applicable-to-runtime`, no `runtime-verified`.
- Un comando nuevo o reclasificar opcional a obligatorio es cambio de contrato: nueva frontera,
  plan ampliado y autorización antes de ejecutarlo.
- Si el checkout receptor no puede cargar o comparar el snapshot/identidad de contenido, el
  resultado actual es `incomplete: code-content-unavailable`; puede conservar el veredicto
  histórico, pero no afirmar que el código actual esté verificado.

La sintaxis concreta se decidirá en la hija de implementación. Para compatibilidad, una cápsula
actual con líneas no comentadas dentro del bloque `## Validation` se interpreta inicialmente como
**todas obligatorias**; una sin sección es legacy y muestra `unknown`, nunca una aprobación plena.
No se debe introducir comentario mágico en el bloque actual hasta que el parser y la migración
estén probados. Los snapshots actuales ya tienen `contentDigest` y `workspaceDigest`: el primero
identifica bytes del workspace y el segundo detecta modificaciones escritas/restauradas. P05 los
conserva para la captura completa y añade, con versión de schema, `reviewContentDigest` para
comparación portable y `reviewWorkspaceDigest` para integridad de la misma captura local. Este
último incluye `ctime`, no viaja como identidad ni se compara con otro checkout o recaptura. No se
reutiliza ni renombra silenciosamente el significado de los antiguos campos.

La continuación propuesta por TASK-061 no queda fuera de toda observación: la frontera futura
publica dos ejes, `reviewBoundary` y `executionMetadata`. Sólo el archivo regular y validado
`<taskRoot>/continuation.json` se registra como metadata con su digest propio; actualizarlo no
cambia la verificación de código, pero se informa como `ADVANCED` y exige reconciliación para
reanudar. En el repositorio activo, tanto crear/borrar como actualizar mediante temporal y `rename`
son cambios administrativos: si `reviewContentDigest` coincide, código queda `CURRENT` y metadata
queda `CREATED`, `REMOVED` o `ADVANCED`. El caso cambia dentro del snapshot inmutable: el digest de
workspace de esa captura detecta sidecar y `ctime` del padre alterados, la carga falla por
integridad y una recaptura no transfiere automáticamente su aprobación anterior. Cualquier otro
archivo de la cápsula sigue alterando la frontera normal.

## Evidencia: cuatro garantías distintas

| Garantía | Pregunta que responde | Lo que no responde |
| --- | --- | --- |
| Integridad | ¿El registro y la frontera aún coinciden? | Quién los produjo. |
| Vigencia | ¿Coinciden con cápsula y código actuales? | Que los comandos sean suficientes. |
| Independencia declarada | ¿El registro dice que revisor e implementador eran distintos? | Que esa identidad sea auténtica. |
| Autenticidad | ¿Un emisor de confianza atestiguó el hecho? | No existe con un hash local solo. |

Un veredicto histórico se conserva como `historicalVerdict` con su frontera, fecha e
independencia declarada. La pantalla/JSON de estado separa `approvedThen` de `verifiedNow`:

```json
{
  "historicalVerdict": {
    "value": "APPROVED",
    "independence": "declared-true",
    "scopeDigest": "sha256:…",
    "codeReviewContentDigest": "sha256:…"
  },
  "verifiedNow": {
    "value": "incomplete",
    "reason": "lint not-run for current code content",
    "reviewBoundary": "CURRENT",
    "executionMetadata": "ADVANCED"
  }
}
```

`independent:false` conserva valor diagnóstico, pero no satisface una puerta que requiera juicio
independiente. La ausencia en registros legacy es `unknown` para la presentación nueva, aunque el
validador anterior fuera compatible con ella. TASK-054 impide llamar autenticidad a cualquiera de
estos campos sin emisor y raíz de confianza externa.

## Proceso proporcional

La proporcionalidad se decide por impacto, reversibilidad, incertidumbre, datos/credenciales,
superficie afectada y coste de fallar; el tamaño de diff es sólo una señal secundaria.

| Perfil | Ejemplo | Forma propuesta | Mínimo conservado |
| --- | --- | --- | --- |
| Ligero | Cambio local reversible conocido | Cinco documentos concisos, una validación específica. | Alcance, criterio, resultado y decisión explícita. |
| Estándar | Función, contrato o varios módulos | Cinco documentos completos y workflow elegido. | Aclaraciones materiales, criterios y validaciones obligatorias. |
| Alto riesgo | Datos, permisos, red, publicación o migración | Cápsula estándar más plan/autorización de ejecución. | Confirmación de alcance, evidencia y rollback. |

Por ahora no hay un sexto formato: una cápsula breve sigue usando los cinco archivos para no
romper Doctor, compile ni el digest. El modo manual y el traspaso al implementador permanecen;
TASK-050 exige confirmación humana de delegación y no se relaja por etiquetar un caso ligero.

Las preguntas se agrupan por decisión y se hacen sólo cuando una respuesta cambia alcance,
implementación o validación. El agente puede decidir detalles técnicos reversibles dentro de
criterios acordados. El usuario decide producto, riesgo, coste, publicación, acceso externo,
datos sensibles y toda ampliación material. Un ticket puede describir trabajo, pero no autoriza
shell, red ni publicación: el orquestador conserva la concesión de ejecución local y verifica su
alcance en cada continuación.

## Matriz de selección UI

La corrección propuesta clasifica primero la **intención**, con español e inglés, y después el
dominio visual. Un workflow CLI explícito siempre gana; las señales de bug/regresión ganan sobre
la clasificación visual porque implican una corrección comprobable.

| Petición | Intención | Selección propuesta | Razón |
| --- | --- | --- | --- |
| `create settings screen` | Construir | `SDD+EDD` | Contrato de comportamiento y ejemplos de UI; no es revisión. |
| `review settings screen` | Revisar | `UI review` | Inspección visual/UX sin suponer modificaciones. |
| `fix screen regression` | Corregir | `TDD` | Bug/regresión tiene precedencia y evidencia regresiva. |
| `component` | Ambigua | `research-first` | No inventa construir ni revisar. |
| `crear pantalla de ajustes` | Construir | `SDD+EDD` | Equivalente semántico en español. |
| `revisa la pantalla de ajustes` | Revisar | `UI review` | Verbo de revisión explícito. |
| `--workflow TDD` | Explícita | `TDD` | La elección expresa gana. |

El clasificador debe devolver razón legible y no depender de `\b` ASCII para palabras españolas.
Las hijas probarán falsos positivos, negaciones y texto mixto. Si la petición sólo menciona un
componente sin verbo, no se asume que haya cambios: se pide/recoge aclaración antes de implementar.

## Doctor y métricas

`akrctx doctor` seguirá informando **salud de instalación**: archivos requeridos, configuración,
política, conflictos, adaptadores y wiki. No se debe llamar “readiness operativa” a un 100/100 de
esa comprobación.

Una futura comprobación operativa será un comando distinto, con checks declarados por nombre y
consecuencia, modos `--dry-run`/selección explícita y consentimiento para cada comando. Nunca
descubre scripts y los ejecuta por existir. Su salida diferencia `available`, `not-configured`,
`blocked-by-policy`, `not-run` y `failed`.

Las métricas deben ser observables, no precios estimados: tiempo hasta resultado, intervenciones
humanas, intentos consumidos, validaciones obligatorias completas, bloqueos, reversiones,
defectos encontrados en revisión y coste/token sólo cuando el host lo informa. Se comparan entre
flujos equivalentes con código, modelo y entorno anotados.

## Migración y cápsulas hijas

| Datos existentes | Lectura tras migración | Nunca se infiere |
| --- | --- | --- |
| Una validación pasada de varias declaradas | Histórico parcial | Verificación completa actual. |
| Sin bloque `Validation` | Legacy desconocido | Que no había checks. |
| `independent` ausente | Independencia desconocida en la nueva vista | Autenticidad. |
| Veredicto APPROVED anterior | Aprobación histórica | Aprobación de la frontera actual. |
| Commit igual, contenido/snapshot distinto o ausente | Veredicto histórico conservado | Código actual verificado. |
| Mismo contenido en recaptura con `ctime` distinto | Identidad portable igual por `reviewContentDigest` | Que la captura local sea la misma o que se transfirió permiso. |
| Edición de `continuation.json` existente | Metadata de ejecución avanzada | Que cambió código o que se transfirió permiso. |
| Alta/baja o `rename` del sidecar activo | Metadata `CREATED`/`REMOVED`/`ADVANCED`; código `CURRENT` si el contenido revisable coincide | Que se transfirió permiso o que la continuación sea reanudable. |
| Sidecar alterado dentro del snapshot | Fallo de integridad de esa captura | Que una recaptura herede automáticamente la aprobación anterior. |

Las cuatro cápsulas independientes propuestas son: P05 (declaración por comando y verificación
completa), P13 (cápsula proporcional y autorización de ejecución), P14a (clasificador UI por
intención) y P14b (Doctor operativo opt-in). No se deben mezclar: P05 toca el contrato de juicio;
P14a sólo `task.ts` y pruebas; P14b sólo diagnóstico/comandos nuevos.

No quedan preguntas de producto abiertas para este diseño. Las decisiones de sintaxis, nombres de
CLI y migración gradual pertenecen a cada cápsula hija y requieren sus propios criterios antes de
modificar runtime. Redactar este contrato no lo convierte en un `APPROVED` independiente.
