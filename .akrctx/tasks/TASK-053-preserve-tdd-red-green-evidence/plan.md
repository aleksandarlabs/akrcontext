# Plan

## Workflow

- SDD+TDD

## Reason

Modifica el contrato del implementer y usa TDD para garantizar precisamente la evidencia
red→green que se quiere exigir.

## Behavior Contract

- **Inputs:** workflow de la cápsula y secuencia de validaciones registrada por ronda.
- **Outputs:** para workflows TDD, evidencia ordenada de red esperado y green posterior, o un
  bloqueo explícito; para otros workflows, comportamiento actual.
- **Preconditions:** el workflow se lee de `plan.md`, sección `## Workflow`; el log sigue
  siendo append-only.
- **Postconditions:** una ronda TDD inválida se rechaza antes de persistirse; red y green
  comparan el mismo comando normalizado; un resumen no puede afirmar TDD sin ambos estados.
- **Out of scope:** convertir el log en evidencia confiada por el judge.

## Implementation Brief

1. Añadir tests de renderizado que exijan la regla red→green en Claude, Codex y Copilot.
2. Decidir la representación mínima en `impl log` reutilizando validaciones ordenadas o campos
   explícitos de fase sin romper records existentes.
3. Hacer que log/status detecte evidencia TDD ausente cuando el workflow lo exige y rechace la
   persistencia con una advertencia o bloqueo accionable antes del handoff.
4. Cubrir red correcto, fallo por motivo equivocado, green ausente, duplicados, los tres
   workflows TDD, workflows no TDD y records legacy.
5. Actualizar documentación y regenerar agentes desde templates.

## Steps

1. Fijar schema y compatibilidad con tests fallidos.
2. Implementar persistencia/diagnóstico mínimo.
3. Actualizar instrucciones de los tres hosts.
4. Validar y solicitar revisión independiente.
