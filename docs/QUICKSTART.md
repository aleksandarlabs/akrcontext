# Quickstart

Get akrctx running in a project in under five minutes.

## 1. Install

akrctx is not on npm yet. Build and link it from source:

```bash
git clone <repo-url>
cd akrctx
pnpm install
pnpm build
pnpm link --global
```

Verify:

```bash
akrctx --version
akrctx --help
```

## 2. Init in your project

Go to any repository where you use a coding agent and run:

```bash
cd /path/to/your-project
akrctx init
```

akrctx detects your existing agent setup (Codex, Claude Code, Copilot, Pi) and asks you to confirm. If nothing is detected, it asks which agent you use.

To skip the prompt:

```bash
akrctx init --target codex      # OpenAI Codex
akrctx init --target claude     # Claude Code
akrctx init --target copilot    # GitHub Copilot
akrctx init --target pi         # Pi
akrctx init --target all        # all at once
```

Preview what would be created without writing anything:

```bash
akrctx init --target codex --dry-run
```

## 3. Open your agent and run doctor

After init, open your coding agent in the project and ask:

```
Run akrctx doctor.
```

The agent reads the installed harness, audits the setup, and populates `.akrctx/wiki/` with project context. This is the step that turns a skeleton into a working harness.

You can also run the CLI doctor to get a readiness score and suggested next prompt:

```bash
akrctx doctor
```

## 4. Create your first task

Ask your agent directly — no CLI needed:

```
Fix the login bug where the session expires too early.
```

The agent reads `AGENTS.md` (or equivalent), creates a task capsule in `.akrctx/tasks/`, chooses the right workflow (TDD for bugs), and implements.

Or create a skeleton capsule via CLI (useful for CI or scripting):

```bash
akrctx task "Fix login session expiry bug"
```

## 5. Check status

```bash
akrctx status
```

Shows installed targets, task count, and current workflow default.

## Optional: enable the judge

The judge is an independent subagent that reviews implementation against the task capsule. It is disabled by default.

```bash
akrctx judge enable
```

See [JUDGE.md](JUDGE.md) for the full flow.

## Reference

| Goal | Command |
|---|---|
| Install harness | `akrctx init` |
| Audit setup | `akrctx doctor` |
| Check status | `akrctx status` |
| Create task capsule | `akrctx task "<description>"` |
| Compile agent brief | `akrctx compile TASK-001` |
| Show config | `akrctx config show` |
| Change workflow default | `akrctx config set defaultWorkflow SDD+TDD` |
| Enable judge | `akrctx judge enable` |
| Update harness to latest | `akrctx upgrade` |
| Remove harness | `akrctx remove --target codex --force` |
