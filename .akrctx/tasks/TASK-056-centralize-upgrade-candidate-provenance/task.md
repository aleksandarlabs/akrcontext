# Task

## Goal

Centralizar la creación y el registro de procedencia de candidatos de `akrctx upgrade` en
una única abstracción interna.

TASK-048 demostró que el contrato actual exige coordinar manualmente `writePlannedFile`, la
clasificación pública `suggest`, la propagación de `createdCandidate` y
`manifest.candidates`. Dos rutas distintas pudieron olvidar o falsear uno de esos pasos. La
nueva abstracción debe hacer imposible registrar como propio un archivo preexistente y debe
registrar automáticamente todo candidato realmente creado por akrctx.

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

- Cambiar qué candidatos se consideran resueltos o eliminables.
- Migrar candidatos legacy sin procedencia.
- Cambiar el formato público de `UpgradeResult`.
- Ampliar la limpieza a directorios de versiones anteriores.

## Clarifications

- None.

## Open Questions

- None.
