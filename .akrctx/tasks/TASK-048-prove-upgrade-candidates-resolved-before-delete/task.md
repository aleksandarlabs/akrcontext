# Task

## Goal

Impedir que `akrctx upgrade` borre candidatos o archivos ignorados sin una prueba positiva
de que el candidato fue resuelto.

La limpieza actual considera obsoleto cualquier archivo regular bajo
`.akrctx/upgrades/<CLI_VERSION>/` que el run no vuelva a escribir. Esa ausencia no demuestra
resolución: un agente puede haberse desactivado, un target puede haber salido de la config,
el inventario gestionado puede cambiar o el directorio puede contener un archivo que akrctx
nunca creó. En esos casos el upgrade elimina información no aceptada y difícil de recuperar.

La limpieza debe ser conservadora: solo puede borrar un candidato cuya procedencia sea
conocida y cuyo estado actual demuestre que ya fue aplicado o sustituido de forma segura.
La mera ausencia en `writes` no es evidencia suficiente.

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

- Borrar candidatos de versiones anteriores.
- Limpiar archivos cuya procedencia o resolución no pueda probarse.
- Editar el `.gitignore` raíz del proyecto.
- Cambiar la estrategia `preserve-and-suggest` para archivos protegidos o modificados.
- Añadir borrado destructivo sin preview en `--dry-run`.

## Clarifications

- None.

## Open Questions

- None.
