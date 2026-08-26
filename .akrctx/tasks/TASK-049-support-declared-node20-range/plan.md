# Plan

## Workflow

- TDD

## Reason

Es una regresión de compatibilidad con un contrato ya publicado. El comportamiento esperado
es pequeño y verificable: el recorrido debe producir los mismos paths sin acceder a
`Dirent.parentPath` ni al modo recursivo añadido después de Node 20.0.

## Implementation Brief

1. Extraer o hacer inyectable el recorrido de archivos para que un test pueda demostrar que
   no depende de `parentPath` ni de `readdir({ recursive: true })`.
2. Escribir primero un test que modele Dirents con solo las propiedades disponibles en el
   mínimo soportado y confirme el resultado POSIX para árboles anidados.
3. Implementar un recorrido explícito con llamadas no recursivas a `readdir` y paths
   acumulados por el caller.
4. Mantener orden determinista, no seguir symlinks y conservar el comportamiento actual de
   archivos regulares y directorios vacíos.
5. Revisar el código de producción añadido desde 0.5.0 para no dejar otra dependencia nueva
   de una API posterior al mínimo declarado dentro del mismo flujo.

## Steps

1. Añadir la regresión de compatibilidad y confirmar su fallo.
2. Sustituir el recorrido incompatible por el helper mínimo.
3. Ejecutar tests focalizados y suite completa.
4. Completar checklist y solicitar revisión independiente.
