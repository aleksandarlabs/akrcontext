# Acceptance Criteria

- AC-1: Un snapshot capturado desde este repositorio contiene un `dist/index.js` generado a
  partir de sus propias fuentes antes de que el judge lo revise.
- AC-2: La captura de un proyecto consumidor no ejecuta su script `build`.
- AC-3: `npm test` puede ejecutarse dentro del worktree del snapshot sin fallar por la ausencia
  de `dist/index.js`.
- AC-4: La captura no copia `dist/` desde el worktree activo.
- AC-5: Un fallo de build impide la captura y deja ningún snapshot parcial.
- AC-6: Los snapshots siguen siendo verificables por sus controles de integridad.
- AC-7: Existing agent instruction files are preserved.
