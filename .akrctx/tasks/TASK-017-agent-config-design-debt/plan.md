# Plan

1. **Docs — `trigger` advisory.** Edit `docs/CONFIGURATION.md` `trigger` row + add a short
   paragraph under "Warnings, not errors" clarifying propagation vs enforcement. Tweak the
   `trigger` doc-comment in `src/types.ts`.

2. **Decision records — append to `.akrctx/wiki/decisions.md`** three dated entries:
   - Legacy `judge`/`comprehensionGate`/`impl` mirroring sunset.
   - Per-target model patterns as a maintenance surface.
   - Closed `agents` extension surface + reconsideration trigger.
   Keep the existing frontmatter `timestamp` updated to the new record date.

3. **Code — `init` narrowing warning.** In `src/init.ts`, after `config` is merged for an
   existing install, compute which newly added targets are narrowed out by each enabled
   agent's explicit `targets` list and surface warnings via `InitResult`. Add a field to
   `InitResult` (or reuse an existing warning channel) — prefer a new `agentTargetWarnings`
   string array to keep it distinct from `policyWarnings` (template-pack concern) and
   `conflicts` (protected-file concern). Only compute for the existing-install + added-target
   case; `--target all` and first installs skip it.

4. **Test — `tests/agents.test.ts`** in the "init target accumulation" describe block: add
   cases for warning fires (enabled agent, explicit `targets` omits new target), warning
   absent (no explicit list / disabled / `--target all`), and dry-run no-op.

5. **Changelog — add one concise `### Changed` entry** under `[Unreleased]` for the `init`
   narrowing warning (user-facing behavioural addition). The doc/decision records are not
   changelog-worthy per project convention (decisions live in `decisions.md`).

6. **Validate:** `pnpm build && npx vitest run`, then `npx tsc --noEmit`.