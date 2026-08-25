# Plan

## Workflow

- SDD

## Reason

El cambio es de contrato documental: define cuándo un agente delega en otro y
quién conserva la responsabilidad del capsule y de la validación. El texto es el
entregable, así que lo que hay que acertar es la especificación, no el
comportamiento en tiempo de ejecución. Los dos tests son de presencia y de valor
por defecto, y no justifican un ciclo TDD completo.

## Behavior Contract

- **Inputs:** `mainInstructionTemplate` renders the protected root instruction
  candidates for Codex, Claude, and Copilot; `resolveAgent` supplies defaults
  only when a configuration omits an implementer trigger.
- **Outputs:** Every rendered root candidate tells the primary agent, after the
  capsule and resolved clarifications, to ask before handing implementation to
  `akrctx-implementer` when `agents.implementer.enabled` is true. It names
  `akrctx impl start` before round one and `akrctx impl status` for budget
  checks, while keeping capsule ownership, validation, and judge handoff with
  the primary agent. The default implementer trigger is `post-clarification`.
- **Preconditions:** Existing explicit `agents.implementer.trigger` and legacy
  `impl.trigger` values remain authoritative under the existing resolver.
- **Postconditions:** The generic step 7 covers implementation by either the
  primary agent or the implementer; no config is written or migrated.
- **Out of scope:** No agent-file change, new command, flag, config key, or
  discovery work for host subagents.

## Steps

1. Registrar el contrato SDD y pedir autorización para usar el implementer
   activado.
2. Redactar el bloque de delegación para `src/templates/instructions.ts`.
3. Ajustar el paso 7 de la secuencia para que no presuponga quién implementó.
4. Cambiar `defaultTrigger.implementer` a `post-clarification`.
5. Añadir los dos tests.
6. Regenerar los archivos afectados y revisar el diff del repo dogfooded.
