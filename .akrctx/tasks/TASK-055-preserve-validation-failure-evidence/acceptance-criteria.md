# Acceptance Criteria

- [x] Un fallo conserva comando normalizado, exit code y salida diagnóstica acotada.
- [x] La evidencia persistida aplica redacción tanto al comando como a la salida y no incorpora
      variables de entorno ni secretos, incluidos valores compuestos o entrecomillados.
- [x] Una causa inferida se etiqueta como inferencia; solo evidencia directa permite marcarla
      como confirmada.
- [x] La evidencia de la ejecución actual queda disponible en JSON y salida humana sin historial
      entre invocaciones.
- [x] Tests cubren truncado, salida vacía, señales y errores de red ambiguos.
- [x] No se amplían permisos ni se automatiza la escalada.
- [x] Documentación describe el límite probatorio de los diagnósticos.
