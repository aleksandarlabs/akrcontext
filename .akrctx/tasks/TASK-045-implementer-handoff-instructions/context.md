# Context

## Relevant Files

- `src/templates/instructions.ts` — genera las instrucciones raíz de los tres
  hosts. Es donde falta todo. Es contenido generado que leerán agentes en otros
  repos, así que va conciso e instructivo.
- `src/agents.ts:56-67` — `knownTriggers` y `defaultTrigger`.
  `post-clarification` ya está en la lista de triggers conocidos del
  implementer.
- `.claude/agents/akrctx-implementer.md` — el archivo del agente. Ya describe
  qué devuelve al llamante y cómo registra la ronda. No se toca.
- `tests/agent-templates.test.ts` — tests de las plantillas de agente.
- `CLAUDE.md` y `AGENTS.md` de este repo — son root instructions protegidas.
  El upgrade nunca las sobrescribe: recibirán un candidato bajo
  `.akrctx/upgrades/`, y aplicarlo exige aprobación humana explícita del diff.

## Constraints

- Las instrucciones raíz son archivos protegidos por `policy.json`. El agente
  solo puede editarlas durante Doctor, tras mostrar el diff mínimo exacto y
  recibir aprobación explícita en la conversación.

## Blocked Reads

- Secrets and credentials must not be read.
