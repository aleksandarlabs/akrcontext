# Plan

## Workflow

- SDD+TDD

## Reason

El cambio redefine una frontera de seguridad y un comportamiento observable del comando
`judge snapshot`. Primero necesita un contrato explícito y después tests negativos que
demuestren que ningún dato controlado por el candidato alcanza una ejecución de proceso.

## Behavior Contract

- **Inputs:** un worktree candidato de akrctx, que puede modificar `package.json`, fuentes,
  lockfiles y cualquier otro archivo permitido por la política.
- **Outputs:** un snapshot inmutable que contiene los artefactos CLI requeridos por la suite
  de akrctx y coincide con la frontera revisada en todos los paths cubiertos por integridad.
- **Preconditions:** la captura no confía en scripts ni comandos almacenados en archivos del
  candidato; `package.json`, la entry y cada módulo local que el bundler lea son archivos
  regulares con un `realpath` contenido en el snapshot; las dependencias locales copiadas
  siguen tratándose como material auxiliar no incluido en la frontera Git.
- **Postconditions:** capturar no ejecuta `scripts.build` ni otro comando derivado del
  candidato, no sigue una entry o import local fuera del snapshot y no copia contenido
  externo a `dist/`; el artefacto generado queda ligado a la integridad del snapshot; un
  fallo del mecanismo fijo de construcción no publica un snapshot parcial; el worktree vivo,
  Git y el estado del package manager quedan sin cambios. El judge trata el snapshot canónico
  como solo lectura y ejecuta toda validación en una copia temporal desechable.
- **Out of scope:** builds genéricos para consumidores y una sandbox completa.

## Implementation Brief

1. Añadir primero una regresión donde el candidato conserva `name: "akr-context"` pero
   cambia `scripts.build` para crear una marca o tocar el worktree vivo; confirmar que el
   test falla porque el script se ejecuta.
2. Mantener el mecanismo fijo de esbuild, propiedad del código de akrctx, cuyos ejecutable,
   entrada y argumentos no proceden del candidato. Evitar configuración ejecutable.
3. Rechazar una entry symlink y controlar las resoluciones locales de esbuild: todo path que
   vaya a cargarse debe resolver por `realpath` dentro del worktree privado. Los imports de
   paquetes permanecen externos.
4. Validar `package.json` antes de leerlo y fallar explícitamente si akrctx no contiene la
   entry fija necesaria.
5. Incluir el artefacto ignorado en la verificación de integridad, separando un digest de
   contenido estable para `snapshotId` de cualquier fingerprint con `ctime` usado para detectar
   escrituras posteriores.
6. Mantener la construcción dentro del snapshot y conservar la limpieza transaccional ante
   errores.
7. Cubrir proyecto consumidor, package name falsificado, metadata symlink, script ausente o
   malicioso, entry ausente o symlink, import absoluto, symlink transitivo, artifact tampering,
   recaptura determinista, build fallido, integridad posterior y ausencia de efectos sobre el
   worktree vivo.
8. Actualizar `CHANGELOG.md` y `docs/JUDGE.md` para describir el alcance real sin afirmar que
   cualquier proyecto con un script `build` se construye automáticamente.
9. Actualizar la plantilla del judge para separar lectura canónica y validación desechable;
   regenerar las copias instaladas solo mediante la CLI.

## Steps

1. Fijar el contrato con tests fallidos de no ejecución.
2. Implementar el build fijo mínimo para los artefactos de akrctx.
3. Ejecutar validación focalizada y completa.
4. Completar el checklist y solicitar revisión independiente.
