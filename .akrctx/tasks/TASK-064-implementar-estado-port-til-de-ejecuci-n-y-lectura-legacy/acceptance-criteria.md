# Acceptance Criteria

- AC-1: AC1: Tipos y validación estricta v1 cumplen contract.md, con estados declarados y sin permisos/revisión evaluados.
- AC-2: AC2: CLI humano y JSON consulta sidecar; missing devuelve unknown sin crear datos; invalid/unsupported JSON observable con exitCode 1.
- AC-3: AC3: Legacy sin sidecar es legible; input nuevo/incorrecto no se reescribe ni se degrada a cero intentos.
- AC-4: AC4: IDs/rutas/doble tarea/symlinks/política/error de lectura se manejan antes de leer contenido no permitido. Lectura acotada a 64 KiB+1, errores no exponen valores.
- AC-5: AC5: Cuenta portable conserva consumed aun sin local; permisos siempre not-evaluated y resumen completo no se presenta como validación actual.
- AC-6: AC6: Tests cubren fixture válida, historia terminal, duplicados, límite, unknown, surplus consumed, unsupported/malformed, JSON CLI, archivos/rutas bloqueadas y symlinks de ancestros y sidecar.
- AC-7: AC7: Digest es de bytes del sidecar; no cambia schema de juez ni exclusiones, no se toca runtime fuera del lector/CLI. Documentar limitación hasta TASK-067.
- AC-8: AC8: Regresión demuestra cinco archivos canónicos y comandos existentes sin cambios; no se escriben sidecars, índices ni migraciones implícitas.
