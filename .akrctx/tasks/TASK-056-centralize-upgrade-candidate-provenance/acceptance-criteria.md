# Acceptance Criteria

- AC-1: Existe una única abstracción interna responsable de escribir candidatos y registrar su
  procedencia.
- AC-2: Managed files, root instructions, manifest inválido y policy inválida usan esa abstracción.
- AC-3: Ningún caller propaga manualmente `createdCandidate` ni actualiza por separado el ledger.
- AC-4: Un candidato realmente creado queda registrado con ruta y hash.
- AC-5: El candidato de manifest usa procedencia externa en `.akrctx/local/` y nunca una afirmación
  de propiedad contenida exclusivamente en sus propios bytes.
- AC-6: Un candidato preexistente no queda registrado ni se elimina posteriormente.
- AC-7: Un candidato manipulado conserva la protección introducida por TASK-048.
- AC-8: `--dry-run` no crea archivos ni modifica `manifest.candidates`.
- AC-9: `--dry-run` no crea ni modifica el ledger externo de procedencia.
- AC-10: La salida pública de upgrade mantiene su clasificación y orden deterministas.
- AC-11: Las validaciones declaradas pasan.
