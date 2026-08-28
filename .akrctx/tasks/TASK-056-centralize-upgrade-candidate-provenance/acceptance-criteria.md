# Acceptance Criteria

- Existe una única abstracción interna responsable de escribir candidatos y registrar su
  procedencia.
- Managed files, root instructions, manifest inválido y policy inválida usan esa abstracción.
- Ningún caller propaga manualmente `createdCandidate` ni actualiza por separado el ledger.
- Un candidato realmente creado queda registrado con ruta y hash.
- El candidato de manifest usa procedencia externa en `.akrctx/local/` y nunca una afirmación
  de propiedad contenida exclusivamente en sus propios bytes.
- Un candidato preexistente no queda registrado ni se elimina posteriormente.
- Un candidato manipulado conserva la protección introducida por TASK-048.
- `--dry-run` no crea archivos ni modifica `manifest.candidates`.
- `--dry-run` no crea ni modifica el ledger externo de procedencia.
- La salida pública de upgrade mantiene su clasificación y orden deterministas.
- Las validaciones declaradas pasan.
