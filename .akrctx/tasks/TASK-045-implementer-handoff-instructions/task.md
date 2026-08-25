# Task

## Goal

akrctx 0.5.0 instala un agente implementer que ninguna instrucción menciona.

`src/templates/instructions.ts` genera las instrucciones raíz que el agente
principal lee en cada repo (`CLAUDE.md`, `AGENTS.md`,
`.github/copilot-instructions.md`). Ni esa plantilla ni ninguna de las seis
skills nombran `akrctx-implementer` ni `akrctx impl`.

El efecto es que activar el implementer no cambia nada. La secuencia de las
instrucciones raíz asume lo contrario: el paso 7 dice "After implementation,
update the task review checklist", dirigido al agente principal. Nada enruta
trabajo hacia el subagente.

El judge sí está documentado de punta a punta en la misma plantilla. Esta tarea
le da al implementer el mismo trato.

## Validation

```
npm test
```

## Out Of Scope

- Diagnosticar si Claude Code descubre el subagente como agent type spawnable.
  Eso es TASK-040.
- Corregir cómo `impl start` e `impl log` consumen el budget. Eso es TASK-043.
- Cambiar el archivo del agente implementer. Su contenido interno ya está
  completo.
- Añadir comandos, flags o claves de config nuevas.

## Clarifications

### Session 2026-08-25

- El agente principal pregunta siempre que el implementer esté activado, no solo
  cuando el usuario lo mencione. Es la simetría del judge, que ya se pregunta con
  "ask for confirmation before invoking akrctx-judge". La pregunta va después de
  crear el capsule y resolver las ambigüedades, y antes de escribir código.
- La condición es `agents.implementer.enabled`, no el valor del trigger. Un repo
  ya instalado lleva `"trigger": "on-request"` escrito por `impl enable`, así que
  condicionar la pregunta al trigger dejaría mudo a todo el que ya lo activó.
- El default de `defaultTrigger.implementer` pasa de `on-request` a
  `post-clarification`. Ese valor ya existe en `knownTriggers`
  (`src/agents.ts:60`) y describe exactamente el momento: capsule hecho,
  ambigüedades resueltas, antes de implementar. No se inventa un trigger nuevo y
  no se migra ninguna configuración existente.
- La tarea no depende de TASK-040. Añade la instrucción a la plantilla raíz, que
  sirve a los tres hosts. Si la invocación falla en Claude Code, eso lo arregla
  TASK-040 y esta instrucción sigue siendo correcta.

## Open Questions

- Ninguna.
