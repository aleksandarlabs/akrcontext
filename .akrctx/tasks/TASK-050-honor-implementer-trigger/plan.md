# Plan

## Workflow

- SDD+TDD

## Reason

Es un contrato entre configuración, CLI e instrucciones generadas para agentes. Debe
especificarse antes de cambiar texto o resultados, y los casos canónico, legacy y por trigger
deben quedar codificados como regresiones.

## Behavior Contract

- **Inputs:** config normalizada con claves canónicas o legacy, estado enabled y trigger
  resueltos, contexto de la petición del usuario y task ID preparado.
- **Outputs:** una vista estable y accesible del estado resuelto, más instrucciones raíz que
  distinguen `on-request` de `post-clarification` y siempre piden permiso antes de delegar.
- **Preconditions:** `resolveAgent` sigue siendo la única semántica de fallback; triggers
  desconocidos continúan siendo warnings y no errores.
- **Postconditions:** las configuraciones equivalentes canónica y legacy producen la misma
  decisión; `on-request` no genera preguntas no solicitadas; `post-clarification` sí ofrece el
  handoff en su punto definido; disabled nunca lo ofrece.
- **Out of scope:** scheduling automático del host o cambios al budget.

## Implementation Brief

1. Definir una salida de runtime que exponga `enabled` y `trigger` resueltos al agente
   principal; preferir extender un comando `impl` existente frente a enseñar a la plantilla
   a duplicar la precedencia de config.
2. Añadir tests de la salida para config canónica, legacy, divergente, disabled y triggers
   conocido/desconocido.
3. Actualizar `mainInstructionTemplate` para consultar esa vista resuelta y describir las
   decisiones de `on-request` y `post-clarification` sin contradecir la confirmación humana.
4. Actualizar tests de los tres hosts y `docs/CONFIGURATION.md`.
5. Regenerar contenido instalado únicamente mediante la CLI; si aparece un cambio protegido,
   mostrar el diff exacto y pedir aprobación antes de aplicarlo.

## Steps

1. Fijar el contrato de resolución y scheduling con tests fallidos.
2. Exponer el estado resuelto y actualizar las instrucciones generadas.
3. Validar compatibilidad canónica y legacy en los tres targets.
4. Completar checklist y solicitar revisión independiente.
