# Review Checklist

- [x] La causa raíz está identificada (frontmatter, naming, host constraint).
      Host constraint: Claude Code no vigila un directorio que no existía al
      arrancar la sesión.
- [x] El fix funciona o la limitación está documentada con workaround.
      Documentada en README y avisada por los tres `enable`. Workaround:
      reiniciar Claude Code.
- [x] `akrctx upgrade` propaga el cambio si es en generación.
      No aplica: el cambio no está en la generación. Las plantillas de agente
      no cambian.
- [x] Existing instructions were not overwritten.
      No se tocó ningún fichero protegido ni ninguna plantilla de agente.
