# Task

## Goal

Dejar akrctx 0.6.0 listo para publicación corrigiendo los cuatro hallazgos de la revisión
del candidato posterior a 0.5.0: redacción de secretos estructurados, continuidad de logs
TDD legacy, limpieza determinista de `dist` y notas de migración finales del judge.

## Validation

```
pnpm vitest run tests/agents.test.ts tests/akrctx.test.ts tests/dogfood.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
npm_config_cache=/private/tmp/akrctx-npm-cache npm pack --dry-run --json
```

## Out Of Scope

- Publicar, crear tags, hacer push o ejecutar `npm publish`.
- Cambiar el modelo de confianza de la evidencia de validación.
- Migrar o reescribir logs locales existentes.
- Añadir compatibilidad con formatos arbitrarios de serialización más allá de asignaciones
  shell/dotenv/YAML ya soportadas y claves JSON/YAML entrecomilladas.

## Clarifications

### Session 2026-09-02

- La nueva versión será 0.6.0, siguiendo la recomendación de la revisión anterior y la
  petición posterior de dejarla lista para publicar en una rama.
- La rama solicitada es `codex/release-0.6.0-hardening`; la publicación queda fuera de esta
  tarea y se entregarán los comandos al final.

## Open Questions

- None.
