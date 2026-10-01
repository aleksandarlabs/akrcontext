# Acceptance Criteria

- AC-1: `judge snapshot --base origin/main` persiste una base operativa expresada como hash completo.
- AC-2: `judge verify --run-tests` puede recomputar la frontera sin disponer de `origin/main`.
- AC-3: Branches locales, tags y hashes completos producen una identidad canonical coherente.
- AC-4: Una base no resoluble falla antes de crear un directorio de snapshot publicable.
- AC-5: La salida distingue, si se conserva, la etiqueta solicitada del hash usado para seguridad.
- AC-6: No se copian refs remotas ni se ejecuta fetch implícito.
- AC-7: Snapshots legacy válidos siguen cargándose o fallan con un diagnóstico explícito y probado.
- AC-8: No se relajan digests, currency ni write detection.
- AC-9: Las validaciones declaradas pasan.
