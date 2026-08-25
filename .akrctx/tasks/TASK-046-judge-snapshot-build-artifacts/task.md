# Task

## Goal

Un snapshot de judge de este repositorio contiene las fuentes y dependencias, pero no
`dist/`, que está ignorado por Git. `npm test` ejecuta tests de integración que invocan
`node dist/index.js`; por tanto un judge no puede completar la validación declarada de
TASK-041 aunque el código fuente y sus tests específicos estén correctos.

Construir los artefactos del CLI dentro de la copia privada e inmutable del snapshot
antes de que el judge la reciba. No copiar `dist/` desde el worktree activo: podría estar
obsoleto y no corresponder al contenido revisado.

## Validation

```
pnpm build
npm test
pnpm lint
```

## Out Of Scope

- Cambiar los comandos de validación declarados por cada cápsula.
- Ejecutar scripts arbitrarios de paquetes consumidores durante una captura de snapshot.
- Copiar artefactos generados desde el worktree activo.

## Clarifications

### Session 2026-08-25

- El usuario autorizó crear una cápsula y aplicar el arreglo. La copia que ve el judge
  debe construir `dist/` localmente; no se reutilizarán artefactos posiblemente obsoletos
  del worktree activo.

## Open Questions

None.
