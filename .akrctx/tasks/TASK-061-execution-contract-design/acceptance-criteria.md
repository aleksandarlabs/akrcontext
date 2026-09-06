# Acceptance Criteria

- AC1: Producir design.md con ejemplos JSON completos de tarea, ejecución, intento y traspaso, diferenciando hechos, propuestas y decisiones aprobadas; incluir el archivo de continuación versionado, separado de los cinco archivos de especificación.
- AC2: Comparar sidecar local, metadatos versionados y almacenamiento compartido: portabilidad, privacidad, atomicidad, migración, tamaño y fallo. Documentar la decisión confirmada: el archivo de continuación versionado transporta estado resumido y los logs completos, conversaciones, snapshots, procesos, reservas, credenciales y permisos permanecen locales.
- AC3: Definir estados, transiciones válidas, revisión de cápsula, runId, workspace, propietario, modelo solicitado/observado y recuperación tras caída. No inventar modelo observado si el host no lo entrega.
- AC4: Modelar mismo agente, dos sesiones en la misma carpeta y otro checkout sin asumir acceso al historial local.
- AC5: Preservar impl start informativo; proponer una operación nueva para reserva si es necesaria. Separar reserva, intento completado y presupuesto por ejecución; mostrar compatibilidad con logs legacy.
- AC6: Definir atomicidad de asignación de TASK-ID y exclusión por ejecución; comparar carreras reales y reintentos idempotentes.
- AC7: Reutilizar TASK-054: registro local no autentica emisor ni transporta permiso. Separar aprobación de alcance, autorización de ejecución y evidencia; una ejecución explícitamente autorizada puede abarcar agentes o sesiones del orquestador, pero un traspaso manual o copia del repositorio no transmite autorizaciones.
- AC8: Cerrar con decisiones a confirmar y cápsulas hijas de implementación; no modificar runtime ni declarar aprobado el diseño por haberlo redactado.
