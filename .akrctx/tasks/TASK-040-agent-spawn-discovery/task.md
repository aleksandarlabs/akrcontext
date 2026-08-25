# Task

## Goal

Los agentes definidos en `.claude/agents/akrctx-*.md` no son descubiertos
automáticamente por el tool `Agent` de Claude Code. El `name` del frontmatter
(`akrctx-implementer`, `akrctx-judge`, `akrctx-comprehension`) no aparece
en la lista de agent types disponibles para spawn. El usuario tiene que usar
un fork con las instrucciones pegadas en el prompt, lo que anula el punto de
tener un fichero de agente separado.

Diagnosticar por qué Claude Code no registra estos agentes como spawnables y
corregir la generación para que funcionen como agent types nativos, o
documentar la limitación si es un constraint del host.

## Validation

```
npx vitest run tests/agents.test.ts
npx biome check src/ tests/
```

`akrctx impl enable` no acepta `--target`; la validación original declaraba una
opción que no existe. Estos dos comandos sí se ejecutan.

Tras enable, el agente generado debe poder ser invocado con
`Agent({ subagent_type: "akrctx-implementer", ... })` desde una sesión de
Claude Code. Si es un constraint del host, el test es que la documentación
lo declare explícitamente.

## Out Of Scope

- Cambios en Claude Code itself — solo en lo que akrctx genera.
- Agentes para targets que no sean Claude Code.

## Clarifications

### Session 2026-08-24

- Encontrado durante el flujo TASK-020 en un repo consumidor: `Agent({ subagent_type: "akrctx-implementer" })` devolvió `Agent type 'akrctx-implementer' not found`. Los types disponibles eran: claude, claude-code-guide, Explore, general-purpose, Plan, statusline-setup. Ninguno de los akrctx agents aparecía.

### Session 2026-08-25

- Causa raíz confirmada, y no es un fallo de generación. Claude Code vigila
  `.claude/agents/` en vivo, pero no vigila un directorio que no existía al
  arrancar la sesión (https://code.claude.com/docs/en/sub-agents). En una
  instalación nueva `akrctx impl enable` crea ese directorio por primera vez,
  así que el fichero es invisible hasta reiniciar. El repo consumidor era
  una instalación nueva; este repo ya tenía `.claude/agents/` al arrancar la
  sesión, y ambos agentes son spawnables aquí ahora mismo.
- El frontmatter que akrctx genera es válido. `name` y `description` son los
  únicos campos obligatorios; `tools`, `model` y `permissionMode` son
  opcionales y están bien formados.
- El aviso de reinicio se imprime solo cuando `enable` crea el directorio.
  Razón: es el único caso en que el host no descubre el fichero. Imprimirlo
  siempre es ruido en el resto de casos y entrena al usuario a ignorarlo.
- Doctor no reporta este caso. Razón: Doctor audita el repo en disco, y el
  estado de descubrimiento depende de la sesión viva, que Doctor no observa.
- El aviso se limita al target `claude`. Los demás targets están fuera de
  alcance por declaración de la propia tarea.

## Open Questions

- Ninguna.
