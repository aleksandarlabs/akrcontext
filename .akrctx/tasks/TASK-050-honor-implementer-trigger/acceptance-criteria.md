# Acceptance Criteria

- AC-1: El agente principal puede obtener `enabled` y `trigger` desde una vista resuelta por
  `resolveAgent`, sin duplicar manualmente la precedencia canónica/legacy en instrucciones.
- AC-2: Una config legacy con `impl.enabled: true` se comporta igual que su equivalente canónico.
- AC-3: `enabled: false` no ofrece ni inicia delegación.
- AC-4: `on-request` solo ofrece delegación cuando el usuario pide usar el implementer.
- AC-5: `post-clarification` ofrece delegación después de crear la cápsula y resolver ambigüedades.
- AC-6: Todo handoff sigue requiriendo confirmación humana explícita.
- AC-7: Un trigger desconocido conserva su warning y no provoca una invocación automática.
- AC-8: Las instrucciones renderizadas para Codex, Claude y Copilot describen la misma semántica.
- AC-9: `docs/CONFIGURATION.md` coincide con el comportamiento generado.
- AC-10: No se migran ni eliminan claves legacy y no cambia el presupuesto de intentos.
- AC-11: Las validaciones de la cápsula pasan y el checklist queda actualizado antes del handoff.
