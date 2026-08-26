# Task

## Goal

Restaurar la compatibilidad de `akrctx upgrade` con todo el rango declarado por
`package.json`: Node `>=20`.

La nueva limpieza recursiva usa `Dirent.parentPath`, API incorporada en Node 20.12.0.
Una instalación válida sobre Node 20.0–20.11 puede llegar a `path.join()` sin parent path y
fallar durante `upgrade`. La implementación debe conservar el contrato `node >=20` y evitar
APIs posteriores al mínimo declarado.

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

- Elevar `engines.node` por encima de `>=20`.
- Cambiar qué candidatos se consideran resueltos; esa seguridad corresponde a TASK-048.
- Añadir compatibilidad con Node 18 o anteriores.
- Modificar la salida pública de `UpgradeResult` salvo que sea necesario para el error.

## Clarifications

- None.

## Open Questions

- None.
