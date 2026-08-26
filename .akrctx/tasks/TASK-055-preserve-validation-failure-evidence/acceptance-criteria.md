# Acceptance Criteria

- [ ] Un fallo conserva comando normalizado, exit code y salida diagnóstica acotada.
- [ ] La salida persistida aplica redacción y no incorpora variables de entorno ni secretos.
- [ ] Una causa inferida se etiqueta como inferencia; solo evidencia directa permite marcarla
      como confirmada.
- [ ] Una repetición exitosa no elimina la evidencia del intento fallido anterior.
- [ ] La salida humana y JSON permiten distinguir intento inicial, escalada y retry.
- [ ] Tests cubren truncado, salida vacía, señales, errores de red ambiguos y retry exitoso.
- [ ] No se amplían permisos ni se automatiza la escalada.
- [ ] Documentación describe el límite probatorio de los diagnósticos.
