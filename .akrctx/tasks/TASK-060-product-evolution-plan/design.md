# Evolución de akrctx: cápsulas, memoria y ejecución

Fecha de preparación: 2026-09-05. Documento de dirección y partición del trabajo.

## Cómo continuar

Este documento conserva el conjunto de propuestas. No es una orden de implementar todas de una vez. El usuario autorizó preparar este plan y las primeras cápsulas; los contratos pendientes se resuelven antes de código. No hay aprobación independiente de este plan.

- [TASK-061: contrato de ejecución](../TASK-061-execution-contract-design/task.md): comenzar por investigación y diseño, sin runtime.
- [TASK-062: búsqueda textual](../TASK-062-capsule-search-readonly/task.md): primera mejora acotada implementable, independiente del diseño de ejecución.
- [TASK-063: verificación y workflows](../TASK-063-verification-and-workflow-contract/task.md): investigación de cambios que afectan garantías o autonomía.

Cada entrega usa los cinco archivos de su cápsula. El implementador no debe recibir solo este documento ni asumir que todas las filas de la hoja de ruta están listas. Releer los módulos pertinentes tras completar dependencias y preparar las siguientes cápsulas contra ese código. Las fechas y estados escritos aquí son convenciones documentales, no funcionalidades ya disponibles.

## Objetivo de producto

Conservar intención y decisiones, recuperar conocimiento y coordinar trabajo verificable entre agentes, sesiones y cambios concurrentes. Servir tanto al usuario que usa un agente para todo como al que prepara con un modelo potente e implementa con otro más barato. Permitir después que un orquestador asigne ese trabajo con políticas explícitas.

El éxito se mide por trabajo resuelto con menos retrabajo y atención humana, no por número de archivos o pasos cumplidos. Mantener un uso local útil sin proveedor LLM ni servicio externo obligatorio.

## Punto de partida comprobado

- src/harness-files.ts enumera cinco archivos. src/task.ts crea/lista/muestra/elimina; no representa un ciclo de vida general ni relaciones entre tareas. El identificador se obtiene de máximo + 1, sin reserva.
- src/compile.ts concatena los cinco documentos. No empaqueta workspace, políticas, rondas o registros del juez.
- src/agents.ts resuelve tres roles y modelos estáticos por target. Los triggers son datos interpretados por instrucciones, no un scheduler.
- src/impl.ts conserva rondas locales por TASK-ID. start es informativo; no reserva ni consume. El almacenamiento actual no es un coordinador transaccional de trabajadores concurrentes.
- src/templates/implementer.ts presupone una instancia nueva que lee documentos y log; el principal conserva responsabilidad sobre especificación y revisión. El camino de un agente único no exige el mismo log especializado.
- src/judge-enforcement.ts liga taskDigest a los cinco documentos. APPROVED exige algún comando declarado aprobado; la reejecución usa la intersección declarados/aprobados. La independencia declarada no autentica al emisor.
- src/hook/report.ts resume sesiones, retiene la primera cápsula detectada y comprueba contenido actual. No reconstruye tareas repartidas entre sesiones. Los hooks observan; no orquestan.
- Los logs y registros detallados son locales e ignorados. Tener una cápsula en Git no equivale a transportar el historial de ejecución.

## Compatibilidad y decisiones previas

Mantener lectura de cápsulas existentes sin exigir metadatos nuevos. Separar contrato de tarea de eventos/resultados mutables, para no invalidar revisiones con actualizaciones administrativas. Un sidecar es una ampliación del modelo de datos aunque no cambie los cinco Markdown; ubicación y esquema se resolverán en TASK-061.

Consultar antes de reemplazar decisiones:

- [TASK-043](../TASK-043-impl-budget-consumption/task.md): start informativo y log consumidor de presupuesto.
- [TASK-050](../TASK-050-honor-implementer-trigger/task.md): triggers y confirmación humana de cada delegación.
- [TASK-051](../TASK-051-avoid-self-invalidating-review-checklists/task.md): completar checklist antes de snapshot.
- [TASK-054](../TASK-054-design-transferable-validation-receipts/task.md): investigación cerrada; un hash local no autentica ejecución. Recibos confiables requieren un emisor y una raíz de confianza externa. No reabrir como implementación implícita.

Estas decisiones no bloquean su evolución, pero cualquier sustitución debe ser explícita y acompañada de migración y criterios. El objetivo de autonomía futura no autoriza hoy ejecutar comandos de tickets ni transferir consentimiento entre sesiones.

## Hoja de ruta completa

Las claves P01–P15 son líneas del plan, no TASK-ID reservados. Crear cápsulas hijas cuando sus contratos estén resueltos.

| Línea | Entrega y resultado esperado | Dependencias | Preparación |
|---|---|---|---|
| P01 | Contrato de tarea/ejecución/intento, almacenamiento, estados y compatibilidad | Ninguna | TASK-061, investigación |
| P02 | Implementar estado y runId, eventos recuperables y lectura legacy | P01 aprobado | Pendiente de cápsula |
| P03 | Reservas, idempotencia, concurrencia y asignación segura de IDs | P02 | Pendiente de cápsula; preservar start legacy |
| P04 | Traspaso/reanudación con revisión de cápsula, workspace, políticas y referencias de evidencia | P02; P03 para ejecución concurrente | Pendiente; distinguir misma carpeta de otro checkout |
| P05 | Verificación completa según contrato declarado y garantías explícitas | TASK-063 aprobado | Pendiente de cápsula; no confundir integridad e independencia |
| P06 | Búsqueda textual local en cápsulas | Ninguna | TASK-062, implementable |
| P07 | Reutilización: nueva tarea derivada de anterior, precondiciones y comparación con código actual | P06; P01 para relaciones durables | Pendiente; nunca heredar APPROVED |
| P08 | Memoria consultable con citas, vigencia, contradicciones y resultados separados | P06; P02/P05 para evidencia | Pendiente; empezar determinista, semántica opt-in posterior |
| P09 | Importación neutral de ticket a borrador enriquecido con código | P01 para identidad/procedencia | Pendiente de elección del primer proveedor |
| P10 | Sincronización idempotente, versiones de origen, conflictos y trazabilidad | P09 | Pendiente de reglas de propiedad de campos |
| P11 | Ejecutor/orquestador con adaptadores, recuperación y resultados estructurados | P02–P05; política de P13 | Pendiente de host piloto |
| P12 | Asignación de modelos y escalado por coste, riesgo y resultados | P11; P15 | Pendiente; política explícita sin precios inventados |
| P13 | Proceso proporcional, aclaraciones agrupadas y autorizaciones acotadas | TASK-063 aprobado | Pendiente; preservar modo manual y contratos protegidos |
| P14 | Corregir selección UI y separar salud de instalación de preparación operativa de Doctor | TASK-063 aprobado | Dos cápsulas independientes después del diseño |
| P15 | Observabilidad por ejecución y evaluación comparativa de utilidad | P01/P02; baseline puede diseñarse antes | Pendiente; sesiones múltiples y varias tareas por sesión |

P06 puede avanzar mientras se resuelven P01 y TASK-063. Evitar editar simultáneamente src/task.ts en tareas distintas sin acordar propiedad. No lanzar automáticamente agentes por la mera existencia de este mapa.

## Contratos de producto por capacidad

### Ejecución y traspaso

Distinguir una intención estable (tarea), una revisión del contrato (digest) y cada ejecución (runId). Registrar modelo solicitado y observado por separado; desconocido no se rellena por inferencia. El historial local informa, no autentica. Un traspaso debe detectar versión de cápsula o workspace incompatible y explicar qué falta sin reiniciar silenciosamente presupuesto.

Probar: mismo agente; nueva sesión misma carpeta; checkout distinto sin local; caída antes/después de persistir; dos trabajadores concurrentes; actualización de especificación mientras se ejecuta; resultado duplicado; log corrupto. Definir propietario y ruta de retorno de preguntas para que no dependan de que una conversación siga abierta.

### Reutilización

Primera entrega: recuperar y crear una cápsula nueva enlazada a la anterior. Revalidar archivos, decisiones, comandos y condiciones del entorno. Mantener original inmutable y presupuesto nuevo separado. Recurrencia, continuación y variante deben distinguirse en el contrato futuro. Copiar una solución previa no equivale a demostrar su aplicabilidad.

### Memoria acumulada

Separar intención, relato del implementador y observación verificada. Citar archivo/línea y versión cuando exista. Una coincidencia de texto no prueba que se resolviera el problema. El índice debe poder reconstruirse; cápsulas antiguas sin resultado se presentan como resultado desconocido. No cargar todo el corpus por defecto.

Fases: búsqueda textual (TASK-062), relaciones y filtros estructurados, síntesis con citas y contradicciones, recuperación semántica opcional si demuestra valor. Los datos personales de comprensión quedan fuera. La narrativa del implementador no debe filtrarse al juez como prueba de corrección; la memoria y el contexto de revisión tienen audiencias diferentes.

### Tickets y cápsulas

El ticket puede conservar demanda de negocio y coordinación; la cápsula concreta alcance técnico, decisiones, archivos, criterios ejecutables y frontera de código. Si el ticket ya contiene ese contrato, referenciar/versionar es preferible a duplicar sin reglas.

Importación neutral: source system, identidad de instancia/proyecto, identificador, URL y revisión del ticket; contenido externo tratado como datos, nunca como instrucciones autorizadas. No importar credenciales ni adjuntos indiscriminadamente. No convertir comandos de un ticket en comandos de validación confiables sin revisión.

El primer importador puede rellenar cinco Markdown existentes y mantener metadatos aparte. Una integración continua necesita deduplicación, propiedad por campo, historial y conflictos. La escritura de vuelta al board/ServiceNow es una capacidad separada que requiere autorización expresa. Un evento duplicado no crea dos tareas ni dos ejecuciones. Un cambio de ticket posterior al inicio produce una propuesta de cambio, no una modificación silenciosa del contrato.

### Orquestación y asignación de modelos

Comenzar con un solo host y un adaptador simulado para pruebas; mantener la interfaz preparada para otros sin construirlos todos. Separar planificador, ejecutor y verificador; estos son roles de protocolo y no obligan a tres llamadas LLM en cada tarea. La asignación puede usar riesgo, calidad de especificación, intentos y presupuesto; registrar por qué escaló y el coste observado cuando esté disponible.

No usar cambios globales de config como selección de modelo por ejecución concurrente. Preservar acceso manual y permitir que una tarea se complete con un solo agente. El formato de cápsula no debe depender del catálogo de modelos.

### Verificación, proporcionalidad y Doctor

TASK-063 resuelve el contrato antes de endurecer APPROVED o modificar prompts. Mantener frases precisas: frontera verificada, comandos reejecutados aquí, emisor externo atestiguó; no mezclar garantías. Revisar si todos los comandos son obligatorios y cómo expresarlo sin romper legacy.

Reducir ceremonias en cambios pequeños con evidencias proporcionales. No establecer tamaño de diff como único indicador de riesgo. Separar estilo técnico reversible de decisiones de producto. El modo UI debe atender a intención de construir/revisar; no convertir toda mención visual en revisión sin modificaciones.

Doctor debe identificar salud de instalación con ese nombre. La preparación operativa, si se añade, necesita checks explícitos y consentidos; nunca ejecutar scripts encontrados solo porque existan. No extender policy.json con restricciones de capacidades del agente prohibidas por AGENTS.md.

## Evaluación y criterio de avance

Comparar tareas equivalentes con baseline actual, cápsula+handoff manual y orquestación cuando exista. Registrar versión de código, modelo/configuración y entorno. Medir tiempo hasta aceptación, intervenciones humanas, tokens/coste disponibles, fallos de validación, defectos detectados y retrabajo. No afirmar ahorro a partir de un caso ni convertir duración en coste estimado sin datos.

Para memoria: medir recuperación de antecedentes relevantes, citas correctas, rechazo de resultados obsoletos y ausencia de afirmaciones de éxito sin evidencia. Para tickets: importación repetida, edición concurrente y trazabilidad. Para ejecución: recuperación y ausencia de doble ejecución frente a fallos simulados.

## Preguntas que se resolverán por fase

- P01: ubicación y transporte del estado, retención y propiedad al cambiar de workspace.
- P05/P13: comandos requeridos y alcance de autorizaciones persistentes; no modificar contratos previos por inferencia.
- P09: qué board concreto y qué instancia/proveedor se usará primero; esquema real y requisitos de privacidad. ServiceNow es un caso objetivo, no una conexión disponible.
- P10: qué campos manda el ticket y cuáles la cápsula; si habrá escritura de vuelta.
- P11/P12: host piloto, proveedores/modelos disponibles, límites de gasto/tiempo y señales de escalado.

No hace falta resolver estas preguntas para entregar este plan, investigar TASK-061/TASK-063 o implementar TASK-062. Sí hacen falta antes de implementar las fases dependientes.

## Entrega al siguiente agente

Prompt sugerido: «Trabaja únicamente en TASK-062. Lee sus cinco archivos y las instrucciones vigentes. Implementa su contrato con SDD+TDD, ejecuta sus validaciones y deja resultados registrados. No implementes otras fases de TASK-060. Si encuentras una incompatibilidad material, devuelve la cuestión antes de ampliar alcance».

Para TASK-061/TASK-063: «Completa la investigación y entrega el diseño y las decisiones que necesitan confirmación. No implementes runtime».

Guardar logs del implementador y del juez en las ubicaciones vigentes. No usar un checkbox posterior al snapshot para registrar revisión. En el handoff especificar archivos cambiados, validación, limitaciones y estado de preguntas, sin declarar revisión independiente que no se hizo.
