# Plan

## Workflow

- TDD

## Reason

Es un bug de preparación de un entorno de validación con una causa y un resultado
observables: un snapshot sin `dist/index.js` no puede ejecutar `npm test`. Un test que
captura el snapshot y ejecuta la suite fija el contrato antes del cambio.

## Steps

1. Añadir un test que capture un snapshot de este proyecto y compruebe que su `dist/index.js`
   existe y permite ejecutar `npm test`.
2. Confirmar que falla por la ausencia del artefacto.
3. Construir el CLI en el worktree privado durante la captura, sin leer ni copiar `dist/`
   desde el worktree activo.
4. Comprobar que un fallo de build limpia la captura temporal.
5. Ejecutar build, tests y lint.
