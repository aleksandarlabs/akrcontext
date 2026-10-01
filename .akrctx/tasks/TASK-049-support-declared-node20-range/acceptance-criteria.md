# Acceptance Criteria

- AC-1: `package.json` conserva `"node": ">=20"`.
- AC-2: El código de producción de la limpieza no usa `Dirent.parentPath`.
- AC-3: El código de producción de la limpieza no depende de `readdir({ recursive: true })`.
- AC-4: El recorrido encuentra archivos regulares en cualquier profundidad y devuelve paths POSIX
  deterministas.
- AC-5: El recorrido no sigue symlinks ni sale de `.akrctx/upgrades/<CLI_VERSION>/`.
- AC-6: La clasificación dry-run y el borrado aplicado conservan su comportamiento funcional.
- AC-7: Un test cubre explícitamente el conjunto de propiedades disponible en el mínimo soportado.
- AC-8: Las validaciones de la cápsula pasan y el checklist queda actualizado antes del handoff.
