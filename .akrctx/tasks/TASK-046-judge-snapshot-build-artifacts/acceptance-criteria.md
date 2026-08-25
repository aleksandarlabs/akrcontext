# Acceptance Criteria

- Un snapshot capturado desde este repositorio contiene un `dist/index.js` generado a
  partir de sus propias fuentes antes de que el judge lo revise.
- La captura de un proyecto consumidor no ejecuta su script `build`.
- `npm test` puede ejecutarse dentro del worktree del snapshot sin fallar por la ausencia
  de `dist/index.js`.
- La captura no copia `dist/` desde el worktree activo.
- Un fallo de build impide la captura y deja ningún snapshot parcial.
- Los snapshots siguen siendo verificables por sus controles de integridad.
- Existing agent instruction files are preserved.
