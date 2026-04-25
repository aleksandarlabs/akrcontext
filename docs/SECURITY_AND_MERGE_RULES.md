# Security and Merge Rules

## Golden rule

ContextForge must never damage or erase an existing agent setup.

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
.contextforge/
```

ContextForge must:

1. detect it
2. preserve it
3. add only missing ContextForge structure
4. create suggested files on conflict
5. record findings in `.contextforge/wiki/agent-setup.md`
6. let doctor perform audit and improvement recommendations

## Do not overwrite

Default: no overwrite.

Only overwrite when `--force` is explicitly passed.

Even with `--force`, be conservative for top-level human-authored files.

## Suggested files

When a file exists, write suggested variants:

```txt
AGENTS.md -> AGENTS.contextforge.suggested.md
CLAUDE.md -> CLAUDE.contextforge.suggested.md
.github/copilot-instructions.md -> .github/copilot-instructions.contextforge.suggested.md
```

## Append blocks

Appending to existing files is allowed only if the user explicitly asks or passes a future `--merge` flag.

If implemented, append blocks must be delimited:

```md
<!-- contextforge:start -->
...
<!-- contextforge:end -->
```

Do not implement automatic append by default.

## Security defaults

- No network calls.
- No telemetry.
- No LLM API calls.
- No source code writes.
- Avoid reading secret files.
- Do not include secrets in generated prompts or task capsules.

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
.contextforge/policy.json
```

With at least:

```json
{
  "version": 1,
  "network": "disabled",
  "llmProvider": "external-agent-only",
  "allowExternalAgentExecution": false,
  "allowSourceCodeWrites": false,
  "mergeStrategy": "preserve-and-suggest",
  "blockedReadPatterns": [".env", ".env.*", "*.pem", "*.key", "secrets/", "credentials/"]
}
```
