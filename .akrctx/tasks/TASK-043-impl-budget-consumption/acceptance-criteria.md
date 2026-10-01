# Acceptance Criteria

- AC-1: Un ciclo `impl start` + `impl log` consume exactamente 1 round del budget,
  no 2.
- AC-2: El budget de 3 permite 3 intentos reales (start+log, start+log, start+log).
- AC-3: `akrctx impl status` reporta el conteo correctamente.
- AC-4: Tests existentes de `impl log` siguen pasando.
- AC-5: Existing agent instruction files are preserved.
