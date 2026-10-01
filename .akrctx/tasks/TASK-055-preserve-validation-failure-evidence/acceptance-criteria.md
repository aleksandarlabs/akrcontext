# Acceptance Criteria

- AC-1: [x] Un fallo conserva comando normalizado, exit code y salida diagnóstica acotada.
- AC-2: [x] La evidencia persistida aplica redacción tanto al comando como a la salida y no incorpora
      variables de entorno ni secretos, incluidos valores compuestos o entrecomillados.
- AC-3: [x] Una causa inferida se etiqueta como inferencia; solo evidencia directa permite marcarla
      como confirmada.
- AC-4: [x] La evidencia de la ejecución actual queda disponible en JSON y salida humana sin historial
      entre invocaciones.
- AC-5: [x] Tests cubren truncado, salida vacía, señales y errores de red ambiguos.
- AC-6: [x] No se amplían permisos ni se automatiza la escalada.
- AC-7: [x] Documentación describe el límite probatorio de los diagnósticos.
