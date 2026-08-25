# Acceptance Criteria

- Un ciclo `impl start` + `impl log` consume exactamente 1 round del budget,
  no 2.
- El budget de 3 permite 3 intentos reales (start+log, start+log, start+log).
- `akrctx impl status` reporta el conteo correctamente.
- Tests existentes de `impl log` siguen pasando.
- Existing agent instruction files are preserved.
