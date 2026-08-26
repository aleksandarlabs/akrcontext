# Acceptance Criteria

- `judge snapshot --base origin/main` persiste una base operativa expresada como hash completo.
- `judge verify --run-tests` puede recomputar la frontera sin disponer de `origin/main`.
- Branches locales, tags y hashes completos producen una identidad canonical coherente.
- Una base no resoluble falla antes de crear un directorio de snapshot publicable.
- La salida distingue, si se conserva, la etiqueta solicitada del hash usado para seguridad.
- No se copian refs remotas ni se ejecuta fetch implícito.
- Snapshots legacy válidos siguen cargándose o fallan con un diagnóstico explícito y probado.
- No se relajan digests, currency ni write detection.
- Las validaciones declaradas pasan.
