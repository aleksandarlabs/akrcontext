# Task

## Goal

Name and pay down five design debts in the `agents` configuration block surfaced during
architectural review, so the tradeoffs stop living as "as it is and stays" and gain a
recorded home with review criteria. Four are documentation (decision records + one config
doc clarification); one is a small DX code change with a test.

1. **`trigger` is advisory metadata named as an active control.** akrctx propagates the
   string but does not act on it — the lead agent / host interprets it. The field name and
   the current docs imply enforcement that does not exist. Fix: clarify in
   `docs/CONFIGURATION.md` and the `types.ts` doc-comment that `trigger` is a host-interpreted
   scheduling hint, not a switch akrctx enforces.

2. **Legacy `judge` / `comprehensionGate` / `impl` mirroring has no sunset.** The keys are
   kept in step forever and `doctor` carries divergence logic indefinitely. Fix: a decision
   record stating the intended exit criteria, so the dual-reading complexity has a review
   date rather than becoming permanent by inertia.

3. **Per-target model patterns are a maintenance surface with known false-positives.** The
   `claude` pattern is already elaborate (Bedrock ARNs, Mantle ids, Vertex names); the
   `codex`/`copilot` ones are simpler and will rot sooner. Fix: a decision record naming the
   surface, the known false-positives (e.g. Foundry deployment names), and the maintenance
   expectation.

4. **`agents.<name>.targets` narrowing can surprise on `init --target <new>`.** Adding a
   target to the project does not auto-enable an agent on it when the agent has an explicit
   `targets` list (a narrowing filter). Fix (code): `akrctx init --target <new>` in an
   existing install warns when an enabled agent with an explicit `targets` list does not
   cover the newly added target, so "I added a target and my agent didn't show up there" is
   visible at install time rather than discovered later.

5. **The closed agent extension surface has no reconsideration trigger.** The fixed
   three-entry list is correct (trust comes from the CLI contract behind each), but there
   is no recorded limit + criterion for revisiting it if a fourth agent with a real contract
   is needed. Fix: a decision record stating the closed surface is a known limit and the
   trigger to reconsider (e.g. repeated requests for a fourth contract-backed gate).

Pi as a second-class agent is already recorded (decision 2026-08-06) and is not re-decided
here.

## Validation

```
pnpm build && npx vitest run
```

## Out Of Scope

- Opening the `agents` block to user-defined agents or adding a plugin/extension API. This
  task records the limit; it does not lift it.
- Migrating, deleting, or auto-converting legacy `judge` / `comprehensionGate` / `impl`
  keys. The decision record names the sunset criteria; the actual removal is a future task.
- Changing trigger semantics, the set of known triggers, or how triggers propagate. The
  field stays a free string; this task only clarifies what it means.
- Changing model validation from pattern to catalogue, or tightening/loosening the
  patterns. The decision record names the maintenance surface; patterns are not edited.
- `akrctx remove`, `upgrade`, or `enable` behaviour.

## Clarifications

### Session 2026-08-08

- The `init --target` warning is a **non-blocking** warning surfaced through the existing
  `InitResult` warning channel, never a failure. `init` still succeeds and writes the target.
  Rationale: an explicit `agents.<name>.targets` list is the user's narrowing; surprising is
  worth reporting, overruling is not.
- The warning fires only for an **enabled** agent with an **explicit** `targets` list that
  omits a **genuinely newly added** target (in `selectedTargets` but not already in the
  prior `config.targets`). Re-running `init --target <already-installed>` — which `doctor
  --fix` does per detected target — never claims an existing target is newly added.
  Agents without an explicit `targets` list (the common case) cover every installed target
  automatically and warn nothing.
- `--target all` is **not** exempt: adding every target still warns per newly added,
  uncovered target, because an agent pinned to a subset is a narrowing surprise regardless
  of how the target was added. Already-present targets never warn. The warning is at most one
  line per enabled-and-pinned agent per uncovered target, so it is never noisy.

## Open Questions

- None recorded yet.