# Acceptance Criteria

- `judge snapshot TASK-XXX` rechaza por defecto un scope con `changedFiles: []`.
- El rechazo no deja un directorio de snapshot parcial.
- El diagnóstico recomienda seleccionar una base que incluya el delta comprometido.
- `--allow-empty` permite explícitamente una captura sin delta.
- La salida humana y JSON hacen visible que la captura vacía fue autorizada.
- La ayuda diferencia `SNAPSHOT:<id>` de la ruta de un review JSON.
- Un snapshot con cambios continúa funcionando sin flags adicionales.
- No se crean commits, ramas ni refs automáticamente.
- Las validaciones declaradas pasan.
