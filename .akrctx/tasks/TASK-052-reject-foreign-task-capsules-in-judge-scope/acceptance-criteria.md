# Acceptance Criteria

- AC-1: `judge scope TASK-047` y `judge snapshot TASK-047` fallan si changedFiles contiene una
  cápsula `TASK-YYY` no autorizada.
- AC-2: El error enumera IDs y paths extranjeros y propone aislar el worktree o usar opt-in.
- AC-3: No se excluye ningún path silenciosamente del digest.
- AC-4: Un mecanismo repeatable y explícito permite una revisión conjunta intencional.
- AC-5: Las inclusiones explícitas quedan representadas y ligadas por `scopeDigest`.
- AC-6: Catch-up conserva y valida la misma decisión de inclusión.
- AC-7: `_template`, el task solicitado y paths que solo se parecen no generan falsos positivos.
- AC-8: Tests cubren salida humana, JSON, múltiples tasks y cápsulas untracked.
- AC-9: La documentación explica que el resto del worktree sigue entrando completo.
- AC-10: `CHANGELOG.md` registra bajo `Unreleased` el rechazo fail-closed, el opt-in explícito,
  la herencia en catch-up y el cambio incompatible del esquema judge a v3.
- AC-11: Las validaciones pasan y el checklist queda listo antes del handoff.
