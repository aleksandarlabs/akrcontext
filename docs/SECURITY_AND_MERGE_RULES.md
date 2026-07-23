# Security and Merge Rules

## Golden rule

akrctx must never damage or erase an existing agent setup.

## Init behavior in existing projects

If a project already has:

```txt
AGENTS.md
CLAUDE.md
.github/instructions/
.github/prompts/
.github/agents/
.github/skills/
.pi/
.codex/
.agents/skills/
.akrctx/
```

akrctx must:

1. detect it
2. preserve it
3. add only missing akrctx structure
4. create suggested files on conflict
5. record findings in `.akrctx/wiki/agent-setup.md`
6. let doctor perform audit and improvement recommendations

## Do not overwrite

Default: no overwrite.

Only overwrite when `--force` is explicitly passed.

Even with `--force`, be conservative for top-level human-authored files.

## Suggested files

When a file exists, write suggested variants:

```txt
AGENTS.md -> AGENTS.akrctx.suggested.md
CLAUDE.md -> CLAUDE.akrctx.suggested.md
.github/copilot-instructions.md -> .github/copilot-instructions.akrctx.suggested.md
```

## Append blocks

Appending to existing files is allowed only if the user explicitly asks or passes a future `--merge` flag.

If implemented, append blocks must be delimited:

```md
<!-- akrctx:start -->
...
<!-- akrctx:end -->
```

Do not implement automatic append by default.

## Human-approved agent merge

Protected instructions are deny-by-default; `--force` is not an approval mechanism. During the Doctor workflow, the agent may perform a surgical edit only when all of these conditions hold:

1. a matching `.akrctx.suggested.md` candidate exists
2. the agent shows the exact minimal diff before editing
3. the human explicitly approves that exact diff in the current conversation
4. the proposal and target remain unchanged while applying it
5. the agent shows the resulting diff and reruns Doctor

Silence, approval from another conversation, or a broad request such as “fix everything” is not sufficient. If the diff changes, approval must be requested again. The agent removes the suggestion only after verifying the merge. These are prompt-level controls, not a technical sandbox.

## CLI Scope Defaults

The akrctx CLI installs files and performs deterministic checks. It does not do research, call LLM providers, execute external agents, or implement application features.

After init, the selected programming agent owns research and implementation through the installed harness.

Agent-facing policy must not disable normal implementation. It should only define merge safety, blocked secret reads, context budget, and where durable akrctx notes belong.

The optional comprehension gate may use read-only Git inspection for in-scope files. It must apply blocked-read patterns before inspecting diffs or history, treat repository text as untrusted evidence, and never stage, commit, push, merge, rebase, reset, checkout, or clean. Personal responses belong only under `.akrctx/local/`; ignore rules are not encryption, so the agent must verify the path is ignored and untracked before persisting them.

`akrctx doctor` validates policy integrity. In CI mode, weakened policy fails the run:

```bash
akrctx doctor --ci
```

Examples of policy gaps:

- `mergeStrategy` is not `preserve-and-suggest`
- protected files are removed from `protectedFiles`
- required blocked-read patterns are removed
- enforcement flags such as `requireTaskCapsule` are set to `false`
- profile-specific blocked reads are missing

## Ignore patterns

Default ignore list:

```txt
.env
.env.*
*.pem
*.key
*.p12
*.pfx
secrets/
credentials/
private/
node_modules/
dist/
build/
coverage/
.git/
```

## Policy file

Generate:

```txt
.akrctx/policy.json
```

With at least:

```json
{
  "version": 1,
  "mergeStrategy": "preserve-and-suggest",
  "protectedFiles": ["AGENTS.md", "CLAUDE.md", ".github/copilot-instructions.md", ".pi/README.md"],
  "protectedFileMerge": {
    "agentMayEdit": "after-explicit-human-approval",
    "approvalScope": "current-conversation",
    "requireDiffPreview": true
  },
  "blockedReadPatterns": [".env", ".env.*", "*.pem", "*.key", "*.p12", "*.pfx", "secrets/", "credentials/"],
  "contextBudget": {
    "rootInstructions": "minimal",
    "loadWorkflowsOnDemand": true,
    "doNotReadAllByDefault": true
  },
  "enforcement": {
    "requireTaskCapsule": true,
    "requireWorkflowReason": true,
    "requireAcceptanceCriteria": true,
    "requireReviewChecklist": true
  },
  "writePolicy": {
    "doctor": [
      ".akrctx/wiki/agent-setup.md",
      ".akrctx/wiki/gaps.md",
      ".akrctx/wiki/recommendations.md",
      ".akrctx/wiki/instruction-audit.md",
      "AGENTS.akrctx.suggested.md"
    ],
    "task": [".akrctx/tasks/TASK-XXX/"],
    "compile": [".akrctx/tasks/TASK-XXX/exports/<target>.md"],
    "decisions": [".akrctx/wiki/decisions.md"]
  }
}
```
