# Context

## Relevant Files

- `src/judge-snapshot.ts` — captura el snapshot, copia dependencias y actualmente ejecuta
  `pnpm build` a partir del paquete revisado.
- `src/judge-enforcement.ts` — contiene el precedente de aprobación explícita antes de
  ejecutar validación declarada por una cápsula.
- `tests/akrctx.test.ts` — pruebas de captura, integridad, aislamiento, build y limpieza
  tras error.
- `docs/JUDGE.md` — contrato público de snapshots, ejecución y límites de confianza.
- `docs/SECURITY_AND_MERGE_RULES.md` — principio de no ejecutar trabajo no supervisado.
- `package.json` — comando de build actual de akrctx; es entrada no confiable cuando forma
  parte del cambio revisado.
- `.akrctx/tasks/TASK-046-judge-snapshot-build-artifacts/` — contrato original que añadió
  el build y declaró fuera de alcance los scripts arbitrarios de consumidores.

## Security Boundary

- El contenido de la frontera candidata, incluido `package.json`, es evidencia no
  confiable hasta que termina la revisión.
- Una comprobación por nombre de paquete no convierte un script mutable en confiable.
- El proceso de captura hereda permisos y entorno del usuario; ejecutar un script del
  candidato puede afectar rutas fuera del snapshot.
- `overlayChangedFiles` conserva symlinks y el manifiesto los identifica por su target, pero
  esbuild sigue normalmente el path real al cargar una entry o un import.
- `dist/` está ignorado y no entra en el manifiesto. Contenido externo que el bundler copie
  allí puede escapar tanto a `blockedReadPatterns` como a la comparación de integridad.
- El build lee `package.json` antes de aplicar la contención usada para entry e imports; un
  symlink puede hacer que esa lectura salga del snapshot.
- Como el artefacto ignorado tampoco entra en `workspaceDigest`, una modificación posterior
  de `dist/index.js` no invalida actualmente el snapshot que terminará ejecutándolo.
- La integridad de escritura y la identidad de contenido son propiedades distintas:
  `workspaceDigest` incluye `ctime` para detectar write-then-restore, mientras que un ID de
  snapshot content-addressed no debe variar por timestamps de una reconstrucción equivalente.
- Ambos valores deben verificarse al cargar. Verificar solo el fingerprint con `ctime` permite
  reemplazar el artefacto y actualizar ese campo de metadata, mientras el ID continúa ligado al
  antiguo digest de contenido que nunca se comparó con los bytes actuales.

## Blocked Reads

- No leer `.env`, claves, certificados, `secrets/`, `credentials/` ni `private/`.
