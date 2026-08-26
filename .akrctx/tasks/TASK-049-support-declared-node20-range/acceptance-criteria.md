# Acceptance Criteria

- `package.json` conserva `"node": ">=20"`.
- El código de producción de la limpieza no usa `Dirent.parentPath`.
- El código de producción de la limpieza no depende de `readdir({ recursive: true })`.
- El recorrido encuentra archivos regulares en cualquier profundidad y devuelve paths POSIX
  deterministas.
- El recorrido no sigue symlinks ni sale de `.akrctx/upgrades/<CLI_VERSION>/`.
- La clasificación dry-run y el borrado aplicado conservan su comportamiento funcional.
- Un test cubre explícitamente el conjunto de propiedades disponible en el mínimo soportado.
- Las validaciones de la cápsula pasan y el checklist queda actualizado antes del handoff.
