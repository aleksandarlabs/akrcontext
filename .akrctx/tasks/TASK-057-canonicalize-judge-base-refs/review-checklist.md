# Review Checklist

- [x] El fallo con `origin/main` está reproducido por una regresión.
- [x] La base operativa se canonicaliza antes de capturar.
- [x] La verificación no necesita refs simbólicas.
- [x] Branch, remote ref, tag y hash están cubiertos.
- [x] Bases inexistentes no dejan snapshots parciales.
- [x] Compatibilidad legacy está definida y probada.
- [x] Los digests y currency mantienen su rigor (evidencia: regresiones de divergencia, vigencia y `verify --run-tests` pasan).
- [x] No se mutan ni copian refs innecesariamente (evidencia: el snapshot reutilizado no contiene `baseRef` y su worktree no conserva remotes).
- [x] Documentación y gates completos pasan.
- [x] La frontera final está lista para revisión independiente.
