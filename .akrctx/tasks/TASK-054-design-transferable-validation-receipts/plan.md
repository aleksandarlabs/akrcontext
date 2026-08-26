# Plan

## Workflow

- research-first

## Reason

La solución depende de un modelo de confianza, no solo de persistir JSON. Implementar antes
de decidir quién atestigua el receipt puede crear seguridad aparente peor que el contrato
honesto actual.

## Research Deliverable

Comparar al menos estas alternativas:

1. Mantener reejecución no transferible y corregir únicamente wording/salidas.
2. Receipt local ligado por hashes, explícitamente informativo y no autenticado.
3. Receipt firmado por CI u otro orquestador con raíz de confianza configurable.
4. Reejecutar siempre en cada handoff y optimizar coste sin persistir confianza.

Para cada una documentar seguridad, UX, portabilidad, revocación, compatibilidad, coste y
qué afirmación exacta puede hacer un agente receptor.

## Decision Gate

- Proponer una recomendación concreta con contrato de inputs/outputs y migración.
- No modificar runtime hasta que el usuario confirme la alternativa.
- Tras confirmación, actualizar esta cápsula a SDD+TDD antes de implementar.

## Steps

1. Leer decisiones y documentación de judge relevantes.
2. Modelar actores, amenazas y raíces de confianza.
3. Comparar alternativas y recomendar una.
4. Pedir confirmación del usuario.
5. Solo entonces seleccionar workflow de implementación y añadir tests.
