# TASK-067

## Goal

Implementar verificación completa de validaciones por comando

## Status

BORRADOR P05; depende de TASK-063 y de TASK-064. No iniciar implementación aún.

## Dependencies

- TASK-063: todas las validaciones obligatorias y verificación por identidad de contenido, no sólo commit; `reviewWorkspaceDigest` es integridad local, no identidad portable.
- TASK-064: readTaskContinuation valida schema y devuelve ruta literal y continuationDigest de bytes. status valid no demuestra vigencia, permiso ni identidad del emisor; esta tarea implementa la exclusión estrecha y los dos ejes de revisión.

## Recommended Workflow

SDD

## Workflow Notes

- Workflow source: explicit CLI override.
- Why this workflow: fill this in before implementation if the reason is not obvious.
- Keep context loading proportional. Do not read all of .akrctx/ unless the task requires it.
- Antes de implementar, convertir este borrador en una cápsula completa con pruebas de cambios sin commit, contenido igual con `ctime` distinto, edición/alta/baja/`rename` del sidecar activo y alteración equivalente dentro de snapshot.

## Validation

Commands that prove this task works. The judge must run at least one of these to
approve, and `akrctx judge verify --run-tests` re-runs the ones the review claims
passed. Nothing outside this list is ever executed.

```
```

## Out Of Scope

- Work outside this task capsule's agreed scope.

## Clarifications

Ambiguity resolved with the human before implementation. Ask only when two plausible
answers would produce different code, validation, or scope. Group answers under a
`### Session YYYY-MM-DD` heading, and propagate any that changes a criterion into
acceptance-criteria.md. One answer per top-level `- ` bullet; only those are read.

- None recorded yet.

## Open Questions

Ambiguity still unresolved. Nothing here blocks mechanically, but the judge reads it:
an approval granted while one of these would have changed the implementation is an
approval against a goal nobody agreed on. Record the question; never assume the answer.
One question per top-level `- ` bullet; only those are read.

- None recorded yet.
