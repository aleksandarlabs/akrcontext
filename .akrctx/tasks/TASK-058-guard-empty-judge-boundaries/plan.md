# Plan

## Workflow

- SDD+TDD

## Reason

Cambia el contrato CLI de captura y añade un guard de seguridad contra aprobaciones sin
delta. Debe especificarse el opt-in y probarse antes de implementar.

## Behavior Contract

- Una frontera con `changedFiles: []` falla por defecto antes de publicar snapshot.
- El error explica que `HEAD` no incluye commits de la rama y muestra cómo elegir `--base`.
- Un flag explícito `--allow-empty` habilita casos intencionales y queda visible en la salida.
- El guard se aplica igual en salida humana y JSON.
- No se infiere ni modifica automáticamente la base Git.

## Steps

1. Añadir una regresión con cambios comprometidos y worktree limpio usando la base por defecto.
2. Añadir el rechazo transaccional y el diagnóstico accionable.
3. Implementar y probar `--allow-empty` para el caso deliberado.
4. Diferenciar claramente snapshot ID y ruta esperada del review record en la ayuda.
5. Actualizar documentación y ejecutar los gates completos.
