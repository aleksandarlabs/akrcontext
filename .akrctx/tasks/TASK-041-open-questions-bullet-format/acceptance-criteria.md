# Acceptance Criteria

- El parser de `sectionBullets` ignora un bullet cuyo texto completo sea
  `none`, `ninguna`, `ninguno` o `n/a`, sin distinguir mayúsculas, seguido de
  forma opcional por una palabra de cierre de esta lista fija: `remaining`,
  `left`, `yet`, `recorded yet`, `so far`, `open`, `pending`. Detrás solo se
  admiten espacios o los signos `.` y `!`.
- La constante `CLARIFICATION_PLACEHOLDER` desaparece. El regex cubre
  `None recorded yet.`, así que una sola regla sustituye a las dos actuales.
- Un bullet que empieza por "None" y continúa con contenido real, por ejemplo
  `None of the callers validate X`, sí cuenta como entrada.
- El filtro aplica igual a `## Clarifications` y a `## Open Questions`.
- `akrctx judge verify` no emite notice de open questions cuando la sección
  solo tiene el placeholder o una variante de "none".
- Cápsulas existentes con `- None recorded yet.` no producen false positives.
- El template shipped no cambia.
- Existing agent instruction files are preserved.
