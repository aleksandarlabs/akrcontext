# Acceptance Criteria

## trigger is documented as advisory

- `docs/CONFIGURATION.md` states that `trigger` is a host-interpreted scheduling hint that
  akrctx propagates but does not enforce, so a reader does not infer a switch akrctx actuates.
- The `trigger` doc-comment in `src/types.ts` says the same thing in one line.

## Legacy mirroring has a sunset record

- `.akrctx/wiki/decisions.md` gains a dated decision record stating the legacy keys are kept
  in step for forward/backward compatibility, the cost (permanent dual-reading + divergence
  logic), and the intended exit criteria (e.g. a minimum supported CLI version floor or a
  recorded adoption threshold of the `agents` block).

## Model patterns have a maintenance record

- `.akrctx/wiki/decisions.md` gains a dated decision record naming the per-target model
  patterns as a maintenance surface, the known false-positives (e.g. Foundry deployment
  names warn), and the expectation that the patterns are revisited per provider release.

## init warns when a new target is narrowed out

- `akrctx init --target <new>` in an existing install, when an enabled agent has an explicit
  `targets` list that does not include `<new>`, surfaces a non-blocking warning naming the
  agent and the omitted target.
- No warning fires when the agent has no explicit `targets` list (the common case), or when
  the explicit list already includes the new target, or when the agent is disabled.
- Re-running `init --target <already-installed>` (as `doctor --fix` does per detected target)
  warns nothing, even if an enabled agent's explicit `targets` list would not cover that
  target: only genuinely newly added targets warn.
- `--target all` warns per newly added, uncovered target for an enabled-and-pinned agent,
  consistently with `--target <one>`; already-present targets never warn. It is not a special case.
- `init` still succeeds and writes the target; the warning never fails the command.
- `--dry-run` still writes nothing.

## Closed extension surface has a reconsideration record

- `.akrctx/wiki/decisions.md` gains a dated decision record stating the three-entry `agents`
  list is closed by design (trust from CLI contracts), and the trigger to reconsider
  (repeated requests for a fourth contract-backed gate), distinct from the existing
  "unknown entry preserved" record.

## Cross-cutting

- `pnpm build && npx vitest run` passes in full.
- `npx tsc --noEmit` adds no new error.
- No installed harness copy under `.claude/`, `.agents/`, `.github/skills/`, or `.pi/` is
  hand-edited; generated output is regenerated from `src/templates/*` if touched.