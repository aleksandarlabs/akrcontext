# Acceptance Criteria

- `judge scope TASK-047` y `judge snapshot TASK-047` fallan si changedFiles contiene una
  cápsula `TASK-YYY` no autorizada.
- El error enumera IDs y paths extranjeros y propone aislar el worktree o usar opt-in.
- No se excluye ningún path silenciosamente del digest.
- Un mecanismo repeatable y explícito permite una revisión conjunta intencional.
- Las inclusiones explícitas quedan representadas y ligadas por `scopeDigest`.
- Catch-up conserva y valida la misma decisión de inclusión.
- `_template`, el task solicitado y paths que solo se parecen no generan falsos positivos.
- Tests cubren salida humana, JSON, múltiples tasks y cápsulas untracked.
- La documentación explica que el resto del worktree sigue entrando completo.
- Las validaciones pasan y el checklist queda listo antes del handoff.
