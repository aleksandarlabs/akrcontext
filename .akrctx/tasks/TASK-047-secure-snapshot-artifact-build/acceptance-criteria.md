# Acceptance Criteria

- `akrctx judge snapshot` nunca ejecuta `scripts.build` ni otro comando leído del
  `package.json` candidato, aunque su `name` siga siendo `akr-context`.
- Un test demuestra que un script candidato con un efecto observable no llega a ejecutarse.
- El snapshot de este repositorio sigue incluyendo un `dist/index.js` construido desde las
  fuentes de su propia frontera.
- El mecanismo de build usa un ejecutable, una entrada y argumentos fijados por akrctx, no
  por archivos de configuración ejecutables del candidato.
- Una entry `src/index.ts` que sea symlink o cuyo `realpath` quede fuera del snapshot se
  rechaza antes de construir.
- El `package.json` usado para decidir el build es un archivo regular cuyo `realpath` queda
  dentro del snapshot antes de leerlo.
- Un repositorio identificado como akrctx sin la entry fija falla explícitamente en vez de
  publicar un snapshot sin el artefacto requerido.
- Todo import local que esbuild vaya a cargar resuelve por `realpath` dentro del worktree
  privado; imports absolutos y symlinks transitivos que escapen se rechazan.
- Un test demuestra que contenido externo no termina copiado en el `dist/index.js` ignorado.
- La captura de un proyecto consumidor sigue siendo source-only y no ejecuta scripts.
- Un fallo de construcción no deja un snapshot parcial.
- La captura no modifica el worktree vivo, refs, índice, stash ni archivos de estado del
  package manager.
- Los controles de integridad de snapshots siguen pasando después de construir artefactos.
- La integridad detecta cualquier modificación posterior de `dist/index.js` y su sourcemap,
  aunque `dist/` esté ignorado por Git.
- Dos capturas equivalentes producen el mismo snapshot ID; timestamps de los artefactos no
  forman parte de su identidad de contenido.
- `loadJudgeSnapshot` compara los bytes actuales con `artifactContentDigest` además de comparar
  el fingerprint mutable; cambiar artefacto y `artifactIntegrityDigest` conjuntamente se rechaza.
- La validación ejecutada por el judge no modifica el snapshot canónico: comandos mutantes como
  `pnpm build` se ejecutan en una copia desechable y el record resultante sigue siendo verificable.
- La documentación describe exactamente qué repositorio se construye y bajo qué mecanismo.
- Las validaciones de la cápsula pasan y el checklist queda actualizado antes del handoff.
