# Acceptance Criteria

- AC-1: La plantilla de instrucciones raíz nombra `akrctx-implementer` y describe
  cuándo delegar en él.
- AC-2: La instrucción dice que el agente principal pregunta antes de delegar, y que
  la pregunta va después del capsule y de las clarificaciones.
- AC-3: La instrucción condiciona la pregunta a que el implementer esté activado, no
  al valor del trigger.
- AC-4: La instrucción dice que el agente principal sigue siendo el dueño del capsule,
  de la validación y del handoff al judge. El implementer solo escribe código y
  registra su ronda.
- AC-5: La instrucción nombra `akrctx impl start` como paso previo a la primera ronda
  y `akrctx impl status` para consultar el presupuesto.
- AC-6: El paso 7 de la secuencia deja de asumir que implementó el agente principal.
- AC-7: `defaultTrigger.implementer` vale `post-clarification`.
- AC-8: Ninguna configuración existente se migra ni se reescribe.
- AC-9: Un test verifica que las instrucciones raíz de los tres hosts nombran al
  implementer.
- AC-10: Un test verifica el nuevo valor por defecto del trigger.
- AC-11: No se añaden comandos, flags ni claves de configuración.
