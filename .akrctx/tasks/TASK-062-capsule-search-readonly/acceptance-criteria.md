# Acceptance Criteria

- AC1: Añadir akrctx task search <query> y --json; buscar una subcadena literal no vacía, sin distinguir mayúsculas, por línea, exclusivamente en los cinco archivos de cápsula. No regex, red, embeddings ni LLM.
- AC2: Devolver cada línea coincidente una sola vez con taskId, taskDir, file (ruta relativa al repositorio), line (1-based) y text; orden numérico de tarea, orden capsuleFiles y línea ascendente. Salida JSON es un array; sin resultados es [].
- AC3: Buscar cápsulas de cualquier antigüedad sin exigir frontmatter ni campos nuevos. Excluir _template, exports y logs; no seguir symlinks de directorio o de archivo. Aplicar blockedReadPatterns antes de leer; política ausente o ilegible produce error explícito.
- AC4: Consulta de espacios vacíos se rechaza. Archivo canónico ausente se omite; otros errores de lectura se reportan y no se presentan como búsqueda completa exitosa.
- AC5: La salida de terminal muestra ubicación citable y contenido; no interpreta coincidencia como decisión vigente, resultado exitoso o evidencia verificada.
- AC6: Tests en directorios temporales cubren orden TASK-002/010/1000, acentos sin normalización adicional, mayúsculas, query con metacaracteres literal, varias coincidencias en una línea, cero resultados, legacy, archivo ausente, política bloqueada y symlinks externos.
- AC7: No cambia create/list/show/rm ni el formato de la cápsula; no escribe índice ni toca archivos durante la búsqueda. Documentar comando y límites.
