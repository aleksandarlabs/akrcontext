# Task

## Goal

`.akrctx/upgrades/` crece sin límite y no está ignorado por Git.

Dos defectos separados:

- `akrctx init` no escribe ningún `.gitignore` para `.akrctx/upgrades/`, así que
  los candidatos aparecen como untracked en cada `git status`. Un candidato de
  `AGENTS.md` es una copia de un archivo de instrucciones que alguien decidió no
  aplicar. Commitearlo por descuido deja dos versiones del mismo archivo en el
  repo, y un agente que lea el árbol puede encontrar la rechazada.
- `akrctx upgrade` escribe candidatos pero nunca los borra. Un candidato ya
  resuelto se queda en disco para siempre. En este repo quedaron tres candidatos
  de 0.5.0 ya aplicados más un directorio 0.4.0 entero.

## Validation

```
npm test
```

## Out Of Scope

- Borrar directorios de versiones anteriores a la actual. Se decidió dejarlos.
- Limpiar candidatos en runs acotados con `--target`.
- Cambiar cómo se decide qué candidato se escribe.
- Editar el `.gitignore` raíz del proyecto. Es propiedad del proyecto.

## Clarifications

### Session 2026-08-25

- El ignore vive en `.akrctx/upgrades/.gitignore` con el contenido `*\n!.gitignore\n`,
  igual que `.akrctx/local/.gitignore` (`src/templates/defaults.ts:56`). No se añade
  ninguna línea al `.gitignore` raíz, porque akrctx no edita archivos propiedad del
  proyecto.
- La limpieza borra solo archivos bajo `.akrctx/upgrades/<CLI_VERSION>/` que el run
  actual no ha escrito. Lo que sigue sin resolver se reescribe en ese mismo run, así
  que un candidato vivo nunca se pierde. Los directorios de versiones anteriores se
  quedan: un candidato viejo no se puede regenerar y borrarlo perdería información.
- La limpieza solo actúa cuando el run cubre todos los targets instalados. Un run con
  `--target <uno>` no reescribe los candidatos de los demás targets, así que los vería
  como resueltos sin serlo. Es la misma condición `coversAllTargets` que ya gobierna el
  avance de `installedVersion` en `src/upgrade.ts`.
- `akrctx doctor` comprueba el ignore y lo repara con `--fix`, igual que hace con
  `.akrctx/local/.gitignore`. Cubre las instalaciones existentes, que no van a
  reinstalar.

## Open Questions

- Ninguna.
