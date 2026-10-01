# Acceptance Criteria

- AC-1: `judge snapshot TASK-XXX` rechaza por defecto un scope con `changedFiles: []`.
- AC-2: El rechazo no deja un directorio de snapshot parcial.
- AC-3: El diagnóstico recomienda seleccionar una base que incluya el delta comprometido.
- AC-4: `--allow-empty` permite explícitamente una captura sin delta.
- AC-5: La salida humana y JSON hacen visible que la captura vacía fue autorizada.
- AC-6: La ayuda diferencia `SNAPSHOT:<id>` de la ruta de un review JSON.
- AC-7: Un snapshot con cambios continúa funcionando sin flags adicionales.
- AC-8: No se crean commits, ramas ni refs automáticamente.
- AC-9: Las validaciones declaradas pasan.
