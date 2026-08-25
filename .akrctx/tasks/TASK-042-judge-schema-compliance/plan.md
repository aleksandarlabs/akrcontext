# Plan

## Workflow

- SDD+TDD

## Reason

Es un contrato (schema) que no coincide con la implementación. Hay que
decidir la forma correcta del schema (SDD) y luego verificar con un test
que el ejemplo embebido lo cumple (TDD).

## Steps

1. Leer `review.schema.json` y el CHANGELOG para `independent`.
2. Decidir si `independent` entra al schema o sale del CHANGELOG.
3. Actualizar schema y/o instrucciones del judge.
4. Verificar que el ejemplo embebido pasa `validateRecord`.
5. Verificar que las instrucciones prohíben campos inventados.
