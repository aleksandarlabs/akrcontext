# Context

## Verified vendor facts (August 2026)

Checked against official documentation, not assumed. Recorded because the plan's
starting assumptions were wrong in two places.

- **Claude Code.** Common payload fields `session_id`, `transcript_path`, `cwd`,
  `hook_event_name`, `permission_mode`. `SessionStart` carries `source` with values
  `startup | resume | clear | compact | fork`. `PreToolUse`/`PostToolUse` carry
  `tool_name`, `tool_input`, `tool_use_id`. Default command-hook timeout 600s, but
  `SessionEnd` hooks share a 1.5s budget — the tightest bound in the system and the one
  AC3 measures against.
- **Codex.** Hooks stable since v0.124. Config at `.codex/hooks.json` or a `[hooks]`
  table in `.codex/config.toml`. Event names and payload shape match Claude Code.
  `PreToolUse` covers `apply_patch` and MCP tools, not just Bash as in earlier releases.
- **Copilot.** Config at `.github/hooks/*.json`, which serves both CLI and cloud agent.
  Emits **two payload dialects**: camelCase (`sessionId`, `toolName`, `toolArgs`) under
  camelCase event names, and snake_case identical to Claude Code under VS Code-compatible
  PascalCase event names. Correcting the plan: non-zero exit is fail-open for every event
  **except `preToolUse`, where it denies the tool call**. Timeouts are fail-open
  everywhere. This is why AC1 exists.
- **Pi.** Not hooks: `.pi/extensions/*.ts`, loaded only after `project_trust`.
  `export default function (pi: ExtensionAPI)`, handlers via `pi.on(...)`. Relevant
  events `session_start` (`{reason, previousSessionFile?}`), `before_agent_start` (can
  inject a message and modify the system prompt — that is phase 2), and `tool_call`
  (`{toolName, toolCallId, input}`, returns `{block?, reason?}`).

## Code to reuse rather than reimplement

- `src/judge-enforcement.ts` — `readBlockedPatterns` (fails closed) and
  `matchesBlockedPattern` for AC11; `resolveCommit` for the base commit in AC8. These are
  already tested and already the project's answer to "which paths must never be read".
- `src/task.ts:findTaskDirectory` — capsule resolution at report time.
- `src/harness-files.ts:capsuleFiles` — capsule completeness at report time (TASK-004).
- `src/config.ts:readConfig` — strict since TASK-004, so the trace commands inherit the
  loud failure instead of a silent default.
- `src/comprehension.ts:isLocalIgnoreContentSafe` / `localIgnorePath` — the existing
  `.akrctx/local/.gitignore` (`*` + `!.gitignore`) already satisfies AC12, and doctor
  repairs it. No new ignore plumbing.

## Design decisions taken before implementation

- **JSONL, not a rewritten JSON document.** The hot path runs on every tool call; a
  read-modify-write over a growing file would be quadratic across a session.
- **Observations, not verdicts.** The hot path records what happened; predicates are
  derived at report time. This keeps `.akrctx/tasks/` out of the hot path (AC10) and lets
  the predicate definitions change later without invalidating traces already collected —
  which matters, because AC14 exists precisely to choose between two definitions.
- **Accept both payload dialects unconditionally.** Cheaper than detecting the host and
  removes a whole class of breakage if a vendor changes which dialect it emits.

## Decision: `TRACE_SCHEMA_VERSION` stays at 1 after the `Area` widening

`Area` gained a distinct `akrctx` value during review, which changes the meaning of one
record: a write inside `.akrctx/` used to classify as `harness` and now classifies as
`akrctx`. The version was deliberately not bumped, because no trace exists outside scratch
directories — the feature is unreleased, opt-in, and was never enabled in this repository.
Bumping would signal drift in data that does not exist.

Recorded here because the header cannot disambiguate on its own: pre-fix and post-fix
builds both stamp `cliVersion: 0.4.0`, so if a pre-fix trace ever surfaced, nothing in the
record would say which meaning `harness` carried. This paragraph is that answer.

## Prior finding that constrains this task

Nothing in `src/` reads `policy.enforcement.*` or `config.defaults.require*`. This task
must not start enforcing them either — it measures. Phase 3 makes them real.

## Blocked Reads

- .env
- .env.*
- *.pem
- *.key
- *.p12
- *.pfx
- secrets/
- credentials/
- private/
