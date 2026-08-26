# Context

## Relevant Files

- `src/templates/instructions.ts` — plantilla raíz que actualmente ignora el trigger.
- `src/agents.ts` — `knownTriggers`, defaults y `resolveAgent`, incluida la caída a
  `impl.enabled` legacy.
- `src/impl.ts` y `src/cli/impl.ts` — estado del implementer; `impl status` hoy informa el
  presupuesto pero no el enabled/trigger resuelto.
- `src/config.ts` — normalización de config canónica y legacy.
- `tests/agent-templates.test.ts` — assertions sobre instrucciones generadas.
- `tests/agents.test.ts` — resolución, compatibilidad legacy, triggers y comandos impl.
- `docs/CONFIGURATION.md` — contrato público que describe `trigger` como scheduling hint.
- `.akrctx/tasks/TASK-045-implementer-handoff-instructions/` — contrato que introdujo la
  delegación y decidió ignorar el trigger para configuraciones existentes.

## Required Semantics

- `enabled: false`: no ofrecer ni delegar.
- `trigger: on-request`: ofrecer delegación solo cuando el usuario pide usar el implementer.
- `trigger: post-clarification`: después de preparar la cápsula y resolver ambigüedades,
  pedir permiso antes de delegar.
- Config legacy: usar la misma resolución que `resolveAgent`, sin leer una sola clave cruda
  como fuente de verdad.
- Trigger desconocido: conservar el warning existente y no inventar una ejecución automática.

## Blocked Reads

- No leer `.env`, claves, certificados, `secrets/`, `credentials/` ni `private/`.
