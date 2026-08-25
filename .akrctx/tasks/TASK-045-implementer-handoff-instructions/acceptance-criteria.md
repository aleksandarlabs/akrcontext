# Acceptance Criteria

- La plantilla de instrucciones raíz nombra `akrctx-implementer` y describe
  cuándo delegar en él.
- La instrucción dice que el agente principal pregunta antes de delegar, y que
  la pregunta va después del capsule y de las clarificaciones.
- La instrucción condiciona la pregunta a que el implementer esté activado, no
  al valor del trigger.
- La instrucción dice que el agente principal sigue siendo el dueño del capsule,
  de la validación y del handoff al judge. El implementer solo escribe código y
  registra su ronda.
- La instrucción nombra `akrctx impl start` como paso previo a la primera ronda
  y `akrctx impl status` para consultar el presupuesto.
- El paso 7 de la secuencia deja de asumir que implementó el agente principal.
- `defaultTrigger.implementer` vale `post-clarification`.
- Ninguna configuración existente se migra ni se reescribe.
- Un test verifica que las instrucciones raíz de los tres hosts nombran al
  implementer.
- Un test verifica el nuevo valor por defecto del trigger.
- No se añaden comandos, flags ni claves de configuración.
