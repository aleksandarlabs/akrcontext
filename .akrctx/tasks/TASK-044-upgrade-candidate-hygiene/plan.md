# Plan

## Workflow

- SDD+TDD

## Reason

Cambia el contrato observable del CLI y añade una operación que borra archivos.
La regla de borrado hay que definirla antes de escribirla (SDD): qué se borra,
cuándo, y qué queda intocable. Un borrado sin test que lo acote es el tipo de
fallo que solo aparece en el repo de un usuario, así que cada límite lleva su
test (TDD).

## Steps

1. Definir el contrato de borrado en las acceptance criteria.
2. Añadir la plantilla del ignore y escribirla desde `init`.
3. Añadir la misma escritura al camino de `upgrade`.
4. Escribir los tests del borrado antes de implementarlo, incluidos los tres
   límites: run parcial, dry-run, versiones anteriores.
5. Implementar el borrado en `src/upgrade.ts`.
6. Añadir la comprobación de `doctor` y su reparación con `--fix`.
7. Registrar el nuevo tipo de escritura en la salida del CLI.
