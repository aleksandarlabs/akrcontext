# Acceptance Criteria

- El agente principal puede obtener `enabled` y `trigger` desde una vista resuelta por
  `resolveAgent`, sin duplicar manualmente la precedencia canónica/legacy en instrucciones.
- Una config legacy con `impl.enabled: true` se comporta igual que su equivalente canónico.
- `enabled: false` no ofrece ni inicia delegación.
- `on-request` solo ofrece delegación cuando el usuario pide usar el implementer.
- `post-clarification` ofrece delegación después de crear la cápsula y resolver ambigüedades.
- Todo handoff sigue requiriendo confirmación humana explícita.
- Un trigger desconocido conserva su warning y no provoca una invocación automática.
- Las instrucciones renderizadas para Codex, Claude y Copilot describen la misma semántica.
- `docs/CONFIGURATION.md` coincide con el comportamiento generado.
- No se migran ni eliminan claves legacy y no cambia el presupuesto de intentos.
- Las validaciones de la cápsula pasan y el checklist queda actualizado antes del handoff.
