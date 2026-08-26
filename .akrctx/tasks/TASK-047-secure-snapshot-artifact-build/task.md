# Task

## Goal

Eliminar la ejecución implícita de código no revisado durante `akrctx judge snapshot`.

La captura reconoce este repositorio comprobando `package.json.name === "akr-context"`
y después ejecuta `pnpm build`. El script real procede del `scripts.build` del mismo
`package.json` que forma parte de la frontera revisada. Un cambio puede conservar el
nombre del paquete y sustituir el script, de modo que pedir un snapshot ejecuta código
antes de que el judge lo revise y sin el consentimiento exigido por
`judge verify --run-tests`.

El snapshot de akrctx debe seguir conteniendo los artefactos CLI necesarios para sus
tests, pero la captura no puede ejecutar comandos, scripts de paquete ni configuración
ejecutable obtenidos del candidato. La operación debe permanecer aislada del worktree
vivo y restaurar cualquier estado incidental del package manager.

La llamada fija a esbuild tampoco puede seguir symlinks ni imports locales fuera del
worktree privado. El candidato controla el contenido de `src/index.ts`; por tanto, fijar
solo el nombre de la entry no basta si su `realpath` o una resolución transitiva escapa
del snapshot y copia contenido externo al `dist/` ignorado.

## Validation

```
pnpm vitest run tests/akrctx.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Cambiar los comandos declarados en las cápsulas de tareas.
- Relajar la aprobación requerida por `judge verify --run-tests`.
- Construir automáticamente artefactos de proyectos consumidores.
- Copiar `dist/` desde el worktree vivo.
- Introducir una sandbox de propósito general para procesos externos.

## Clarifications

### Session 2026-08-25

- Tras la primera revisión independiente, el usuario pidió completar TASK-047 cerrando
  también escapes de lectura mediante entry symlink, import absoluto o symlink transitivo.
  El build fijo con esbuild se conserva, pero toda resolución local debe permanecer dentro
  del worktree privado.
- La revisión posterior encontró que `package.json` aún se lee antes de comprobar symlink y
  `realpath`, que el `dist/` generado queda fuera del manifiesto de integridad por estar
  ignorado y que una entry ausente omite silenciosamente el artefacto requerido.
- La siguiente remediación cerró esos tres casos, pero construyó `artifactDigest` con
  `workspaceDigest`, que incorpora `ctime`, y después lo incluyó en `snapshotId`. Dos capturas
  del mismo contenido dejan de tener identidad determinista.
- La ronda 4 también cambió `.akrctx/config.json` de tres a cuatro intentos para poder iniciarse;
  ese cambio de política debe revertirse o contar con autorización explícita fuera del scope.
- El cierre separó correctamente identidad e integridad y restauró la configuración, pero la
  carga solo compara `artifactIntegrityDigest`. Debe comparar también los bytes actuales con
  `artifactContentDigest`; de otro modo, artefacto y fingerprint mutable pueden alterarse juntos
  sin cambiar el digest de contenido que mantiene el snapshot ID.
- El judge posterior ejecutó `pnpm build` dentro del snapshot canónico, como indican actualmente
  sus instrucciones, y modificó los artefactos protegidos. El record resultó `BLOCKED` y después
  `INVALID`. Las validaciones mutantes del judge deben ejecutarse en una copia desechable o el
  snapshot canónico debe preservarse intacto por otro mecanismo.

## Open Questions

- None.
