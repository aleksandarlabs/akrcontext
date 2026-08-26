# Plan

## Workflow

- SDD+TDD

## Reason

Es un contrato de secuencia entre cápsula, snapshot y judge. Debe quedar especificado en
las plantillas y protegido por tests para no reintroducir un write administrativo posterior.

## Behavior Contract

- **Inputs:** checklist completado por el lead agent y frontera candidata aún sin revisar.
- **Outputs:** un checklist cuyo estado final previo al snapshot expresa `ready for independent
  review`; el record verificado expresa que la revisión se completó.
- **Preconditions:** los cinco archivos de cápsula continúan ligados por `taskDigest`.
- **Postconditions:** un APPROVED no requiere editar la cápsula; cambios sustantivos posteriores
  siguen detectándose y exigiendo catch-up.
- **Out of scope:** debilitar la integridad o mover records versionados al repositorio.

## Implementation Brief

1. Localizar cualquier plantilla o instrucción que pida marcar `review completed` después del
   judge.
2. Cambiarla por una condición pre-snapshot como `ready for independent review`.
3. Añadir una regresión que modele el handoff completo y demuestre que no hay write requerido
   después de APPROVED.
4. Mantener una prueba separada de que un cambio real del checklist sí mueve `taskDigest`.
5. Actualizar documentación y regenerar copias instaladas solo mediante la CLI; los archivos
   protegidos requieren diff exacto y aprobación.

## Steps

1. Fijar el contrato de secuencia con tests fallidos.
2. Actualizar templates e instrucciones no protegidas.
3. Regenerar y revisar candidatos protegidos según policy.
4. Validar y solicitar revisión independiente.
