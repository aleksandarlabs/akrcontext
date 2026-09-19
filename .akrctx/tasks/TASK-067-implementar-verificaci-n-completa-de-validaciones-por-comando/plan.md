# Plan

## Workflow

SDD+TDD

## Steps

1. Leer contract.md y `.akrctx/policy.json`.
2. W1: escribir primero las pruebas rojas del parser y de la puerta estricta. Implementar después.
3. Verificar W1 con `pnpm exec vitest run tests/akrctx.test.ts`.
4. W2: pruebas rojas de `reviewContentDigest` y `reviewWorkspaceDigest`. Implementar después.
5. Verificar W2 con la misma orden.
6. W3: pruebas rojas de los dos ejes y de la exclusión estrecha. Implementar después.
7. Ejecutar las cinco validaciones declaradas.
8. Cerrar el checklist y registrar resultados en log.md.
