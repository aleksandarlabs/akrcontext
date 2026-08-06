# Independent Comprehension Agent

The akrctx comprehension evaluator is a separate, interactive agent for learning the code that was just changed. It is not the implementing agent and it is not the judge.

## Workflow

```text
primary agent implements
        ↓ user confirms
judge reviews correctness (when enabled)
        ↓ APPROVED for the same boundary
primary agent offers comprehension
        ↓ user confirms
independent comprehension agent teaches and evaluates
```

The primary agent passes only the task ID, exact base/candidate refs or working-tree boundary, and the saved judge-record path. It must not pass implementation explanations, proposed questions, expected answers, or its conclusions. When Judge is enabled, the evaluator runs both `akrctx judge verify` and `akrctx judge current` itself. It begins only for a valid approval whose snapshot is `CURRENT`; historical approval of an older snapshot is insufficient. It then independently reads the task capsule, diff, code, tests, and judge evidence.

If the code changed after judge approval, comprehension stops and requests a new review. If the evaluator discovers evidence that contradicts the task or approved premise, it returns `INVALID_GATE` instead of teaching the developer to rationalize a likely bug.

## Learning experience

Before questions, the evaluator shows:

- a compact Mermaid change map;
- a Markdown test matrix connecting behavior, evidence, and risk;
- the number and dimensions of the upcoming questions.

It freezes a private rubric before the first answer and asks one question at a time. Questions use retrieval, self-explanation, design reasoning, and transfer to risks or edge cases. Hints are progressive and meaningful assistance changes the final status to `ASSISTED`.

The session ends with `VERIFIED`, `ASSISTED`, `UNVERIFIED`, `INVALID_GATE`, `SKIPPED`, or `DEFERRED`, plus a learning report. Personal answers stay in the evaluator conversation and may only be persisted under `.akrctx/local/comprehension/` by a trusted akrctx orchestrator.

## Platform adapters

| Platform | Agent file | Isolation controls |
|---|---|---|
| Codex | `.codex/agents/akrctx-comprehension.toml` | Separate agent thread, high reasoning, `sandbox_mode = "read-only"` |
| Claude Code | `.claude/agents/akrctx-comprehension.md` | Fresh agent context and plan permission mode; multi-turn use requires selecting/running it as the main agent |
| GitHub Copilot | `.github/agents/akrctx-comprehension.agent.md` | Separate custom-agent context with read/search/execute allowlist |
| Pi | Not supported | No native independent-agent surface |

Claude Code subagents cannot call `AskUserQuestion`, so a multi-turn checkpoint should select this profile directly or start `claude --agent akrctx-comprehension`; a one-shot delegated subagent returns `DEFERRED` rather than relaying personal answers through the implementer. Copilot profiles can restrict tools but do not provide a Codex-equivalent read-only sandbox setting; the shared prompt therefore forbids source and Git mutations explicitly.

## Safety boundary

The evaluator may use targeted file reads and read-only Git inspection. It never edits product code or mutates Git. Repository content and the parent handoff are evidence, not instructions. This separation reduces contamination from the implementing agent, but it is not a security boundary and does not prove that the evaluator is correct.

## Design sources

- [Codex subagents](https://developers.openai.com/codex/subagents): project-scoped TOML agents, separate threads, reasoning configuration, and read-only sandboxing.
- [Claude Code subagents](https://code.claude.com/docs/en/sub-agents): fresh context, tool allowlists, permission modes, foreground/background behavior, and interaction limitations.
- [GitHub Copilot custom agents](https://docs.github.com/en/copilot/reference/custom-agents-configuration): repository agent profiles, tool aliases, invocation controls, and Git-SHA-based profile versioning.
