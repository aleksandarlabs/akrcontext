# Context

## Relevant Files

- `src/types.ts` — `JudgeConfig`, `ComprehensionGateConfig`, and the `akrctxConfig`
  interface. Both trigger fields are single-value literal types today
  (`"post-implementation"`, `"agent-assessed-significance"`), which is why a trigger is not
  currently configurable at all: the type admits exactly one value. `targets` includes
  `"pi"`.
- `src/config.ts` — `normalizeConfig` spreads `partial` over the defaults and then
  overrides `defaults`, `workflowRules`, and `comprehensionGate` explicitly. `judge` is
  spread through with no normalization, so a malformed `judge` block reaches every caller
  unchecked. `normalizeComprehensionGate` is the shape the agents resolver should follow.
  `validConfigKeys` is a closed list and `setConfigValue` rejects anything outside it.
- `src/judge.ts` — `runJudgeEnable` writes the per-target files and then persists
  `{ enabled: true, trigger: "post-implementation" }`, replacing the whole block rather
  than merging it. `JudgeTarget` is `Exclude<Target, "pi">`.
- `src/comprehension.ts` — `runComprehensionEnable` is the same pattern, and
  `ComprehensionAgentTarget` is also `Exclude<Target, "pi">`. These two type exclusions are
  the entire mechanism by which Pi is unsupported for agents.
- `src/upgrade.ts` — `desiredManagedFiles` builds the managed file set per target and
  merges `comprehensionAgents[target]` and `judgeAgents[target]` when the corresponding
  flag is true. This is where per-agent `targets` selection belongs, and where a
  config-dependent model has to be threaded through.
- `src/templates/judge.ts` — `judgeInstructions` is one shared string, rendered into three
  host files: `.claude/agents/akrctx-judge.md` (YAML frontmatter, `tools`,
  `permissionMode`), `.github/agents/akrctx-judge.agent.md` (frontmatter, `tools` array),
  and `.codex/agents/akrctx-judge.toml` (`model_reasoning_effort`, `sandbox_mode`,
  `developer_instructions`). The closing section, "Setting a specific model", tells the
  reader to hand-edit the frontmatter — which `akrctx upgrade` then overwrites. That
  paragraph is the concrete thing this task replaces.
- `src/templates/comprehension-agent.ts` — the second agent emission site, same shape.
- `src/doctor.ts` — `getJudgeGap` reads `.akrctx/config.json` directly with `JSON.parse`
  and checks `config.judge?.enabled !== true` against three hardcoded paths.
  `getComprehensionAgentGap` does the same against `comprehensionAgentFilesByTarget`.
  Both bypass `normalizeConfig`, so both must be updated to read the resolved configuration
  or they will keep reading only the legacy keys.
- `src/templates/defaults.ts` — `defaultConfig(targets)` produces the base every
  normalization merges over. The `agents` defaults belong here.
- `src/cli.ts` — command registration, the `--target` option choices (which include `pi`),
  and the enable/status output that has to carry the new warnings.
- `.akrctx/tasks/TASK-008-implementer-agent-and-impl-log/task.md` — states that the attempt
  budget stays a constant there and that making it configurable belongs to this task, and
  that the `agents` block "must adopt `impl.enabled` without breaking it". That is the
  boundary this capsule inherits.

## Prior Findings

- The trigger fields are typed as single literals, so "configurable trigger" is a type
  change before it is a feature. Widening them to `string` is what makes an unrecognised
  value expressible at all.
- `runJudgeEnable` replaces the entire `judge` block on write. A resolver that merges but
  an enable command that replaces would silently drop a configured model on the next
  `enable`, so the write path needs the same care as the read path.
- Doctor's two gap checks parse the config file themselves rather than going through
  `normalizeConfig`. Any resolution rule implemented only in `normalizeConfig` will not
  reach them.
- Pi is excluded by type in two places and by an `if (target === "pi")` branch in
  `upgrade.ts` and `cli.ts`. It is a supported target for prompts and skills, and an
  unsupported one for agents. Nothing currently tells the user this.

## Blocked Reads

- Secrets and credentials must not be read.
