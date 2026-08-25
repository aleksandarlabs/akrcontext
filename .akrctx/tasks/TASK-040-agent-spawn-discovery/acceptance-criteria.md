# Acceptance Criteria

- Los agentes generados por `akrctx impl enable`, `judge enable` y
  `comprehension enable` son invocables por su `name` desde el tool `Agent`
  de Claude Code, O la limitación está documentada en el README y en la
  salida de `enable` con una alternativa funcional (e.g. fork pattern).
- Si el fix es en la generación, `akrctx upgrade` propaga el cambio.
- Existing agent instruction files are preserved.
