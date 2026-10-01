# Acceptance Criteria

- AC-1: `akrctx judge snapshot` nunca ejecuta `scripts.build` ni otro comando leído del
  `package.json` candidato, aunque su `name` siga siendo `akr-context`.
- AC-2: Un test demuestra que un script candidato con un efecto observable no llega a ejecutarse.
- AC-3: El snapshot de este repositorio sigue incluyendo un `dist/index.js` construido desde las
  fuentes de su propia frontera.
- AC-4: El mecanismo de build usa un ejecutable, una entrada y argumentos fijados por akrctx, no
  por archivos de configuración ejecutables del candidato.
- AC-5: Una entry `src/index.ts` que sea symlink o cuyo `realpath` quede fuera del snapshot se
  rechaza antes de construir.
- AC-6: El `package.json` usado para decidir el build es un archivo regular cuyo `realpath` queda
  dentro del snapshot antes de leerlo.
- AC-7: Un repositorio identificado como akrctx sin la entry fija falla explícitamente en vez de
  publicar un snapshot sin el artefacto requerido.
- AC-8: Todo import local que esbuild vaya a cargar resuelve por `realpath` dentro del worktree
  privado; imports absolutos y symlinks transitivos que escapen se rechazan.
- AC-9: Un test demuestra que contenido externo no termina copiado en el `dist/index.js` ignorado.
- AC-10: La captura de un proyecto consumidor sigue siendo source-only y no ejecuta scripts.
- AC-11: Un fallo de construcción no deja un snapshot parcial.
- AC-12: La captura no modifica el worktree vivo, refs, índice, stash ni archivos de estado del
  package manager.
- AC-13: Los controles de integridad de snapshots siguen pasando después de construir artefactos.
- AC-14: La integridad detecta cualquier modificación posterior de `dist/index.js` y su sourcemap,
  aunque `dist/` esté ignorado por Git.
- AC-15: Dos capturas equivalentes producen el mismo snapshot ID; timestamps de los artefactos no
  forman parte de su identidad de contenido.
- AC-16: `loadJudgeSnapshot` compara los bytes actuales con `artifactContentDigest` además de comparar
  el fingerprint mutable; cambiar artefacto y `artifactIntegrityDigest` conjuntamente se rechaza.
- AC-17: La validación ejecutada por el judge no modifica el snapshot canónico: comandos mutantes como
  `pnpm build` se ejecutan en una copia desechable y el record resultante sigue siendo verificable.
- AC-18: La documentación describe exactamente qué repositorio se construye y bajo qué mecanismo.
- AC-19: Las validaciones de la cápsula pasan y el checklist queda actualizado antes del handoff.
