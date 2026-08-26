# Task

## Goal

Canonicalizar inmediatamente `--base` a un commit Git inmutable para que snapshots y
`judge verify --run-tests` no dependan de refs simbólicas ausentes en workspaces desechables.

Durante TASK-048, un snapshot correcto creado con `--base origin/main` fue aprobado y sus
seis comandos pasaron, pero la verificación fuerte terminó INVALID porque la copia temporal
no contenía la ref remota `origin/main`. Repetir el mismo snapshot con el hash del commit
funcionó. La CLI debe resolver una ref disponible en el workspace vivo una sola vez y usar
su hash en toda recomputación posterior.

## Validation

```
pnpm vitest run tests/akrctx.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Copiar refs remotas completas al snapshot.
- Ejecutar `git fetch` automáticamente.
- Aceptar una base que no pueda resolverse al capturar.
- Relajar la comparación de scope o la detección de cambios.

## Clarifications

- None.

## Open Questions

- None.
