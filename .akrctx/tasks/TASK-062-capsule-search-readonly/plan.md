# Plan

## Workflow

SDD+TDD

## Behavior Contract

- Entrada: `akrctx task search <query>` acepta una consulta literal que no sea solo espacios. La comparación es por línea y no distingue mayúsculas, sin normalizar acentos ni interpretar expresiones regulares.
- Lectura: rechazar un enlace simbólico en `.akrctx` antes de cargar `blockedReadPatterns` o examinar contenido. Recorrer únicamente directorios de cápsula reales, omitir `_template` y cualquier enlace simbólico; por cada cápsula, leer solo `capsuleFiles` en su orden canónico. Un archivo inexistente se omite y cualquier otro error de lectura detiene la búsqueda con error explícito.
- Salida: cada coincidencia contiene `taskId`, `taskDir`, `file`, `line` y `text`. Se ordenan por identificador numérico de tarea, orden de `capsuleFiles` y línea ascendente. La salida JSON es el array exacto; la salida humana muestra `file:line` y el texto.
- Límites: la búsqueda no escribe archivos, no crea índice, no sigue enlaces, no infiere vigencia ni aprobación y no usa red, regex, embeddings ni LLM.

## Steps

1. Leer los cinco archivos, config/policy y las dependencias concretas.
2. Confirmar que el código actual sigue encajando con el contrato; devolver dudas materiales al responsable.
3. Fijar el contrato de aceptación; para código escribir tests que fallen por la funcionalidad ausente.
4. Implementar el alcance mínimo y verificar el comportamiento; no ampliar a otras fases.
5. Ejecutar validaciones pertinentes, registrar resultados y completar checklist antes de snapshot.
6. Seguir la política vigente del juez si se solicita revisión; no marcar aprobación independiente sin registro verificado.
