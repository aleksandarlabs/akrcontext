# Plan

## Workflow

- SDD+TDD

## Reason

Modifica el contrato de errores y de handoff de operaciones sensibles. Necesita un formato
acotado, reglas de redacción y regresiones antes de alterar mensajes o records.

## Behavior Contract

- **Inputs:** comando de validación, resultado del proceso y clasificación causal opcional.
- **Outputs:** evidencia de la ejecución actual con comando normalizado, resultado, exit code/señal
  y observación acotada/redactada. El diagnóstico opcional usa certeza `inferred` o `confirmed`
  y nunca confunde la observación con la causa.
- **Preconditions:** no se leen fuentes adicionales para enriquecer el diagnóstico.
- **Postconditions:** secretos y salidas enormes no se incorporan al record o informe; la evidencia
  no crea permisos ni altera `APPROVED` o `CURRENT`, y no se conserva entre invocaciones.
- **Out of scope:** conceder permisos o garantizar que toda causa sea diagnosticable.

## Implementation Brief

1. Inventariar dónde snapshot/verify capturan y resumen fallos de comandos.
2. Añadir regresiones para exit code, stderr, truncado, redacción y causalidad incierta en la
   ejecución actual.
3. Definir una representación común que pueda persistirse y mostrarse en salida humana y JSON
   sin romper consumidores existentes.
4. Actualizar las instrucciones para exigir evidencia antes de afirmar `sandbox`, `network`
   o `dependency resolution` como causa.
5. Cubrir el fallo actual sin convertir observaciones ambiguas en causas confirmadas.

## Steps

1. Fijar el contrato de error con tests fallidos.
2. Implementar captura, truncado y redacción.
3. Actualizar reporting e instrucciones generadas.
4. Validar y solicitar revisión independiente.
