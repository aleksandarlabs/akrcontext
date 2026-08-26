# Task

## Goal

Evitar que el checklist de una cápsula invalide automáticamente la revisión que pretende
registrar.

El dogfooding de TASK-047 incluyó `Independent review is completed after implementation`.
Ese ítem solo puede marcarse después de recibir APPROVED, pero `review-checklist.md` forma
parte de `taskDigest`. Marcarlo movió la frontera, obligó a repetir las seis validaciones,
crear un catch-up y lanzar un segundo judge para un delta puramente administrativo.

Las plantillas e instrucciones deben dejar todo el checklist listo antes de capturar. La
existencia y validez del record del judge es la evidencia de revisión; no necesita un
checkbox posterior dentro de la frontera revisada.

## Validation

```
pnpm vitest run tests/akrctx.test.ts tests/agent-templates.test.ts
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Excluir `review-checklist.md` de `taskDigest`.
- Relajar la detección de cambios posteriores al snapshot.
- Considerar válido un record no verificado o no actual.
- Editar instrucciones raíz protegidas sin preview y aprobación.

## Clarifications

- None.

## Open Questions

- None.
