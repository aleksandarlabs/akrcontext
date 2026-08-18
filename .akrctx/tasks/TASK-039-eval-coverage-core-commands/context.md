# Context

## Relevant Files

- `evals/README.md` — the rules and the loop. Its "Minimum evidence" table states what each change
  type must show. This task adds the scenarios that make those rules apply to the core commands.
- `evals/scenarios/smoke/` — the nine existing scenarios. Read for style; leave unchanged.
- `evals/schema/scenario.schema.json` — the contract every new scenario satisfies. Unchanged by
  this task.
- `evals/fixtures/` — six fixtures: `minimal-typescript`, `initialized-claude`, `existing-hooks`,
  `invalid-config`, `trace-all-targets`, `trace-session`. `initialized-claude` and
  `existing-hooks` are the closest starting points for the install scenarios.
- `evals/lib/fixture.mjs` — how a fixture is materialised. The place to answer whether a fixture
  can be a real Git repository with commits, which the `judge` scenarios need.
- `evals/lib/process.mjs` — step execution, the `$AKRCTX` expansion, the environment allow-list and
  the 1 MiB stream budget. Scenarios inherit all of it.
- `evals/cli.mjs` — `run`, `compare`, `--suite`, `--scenario`, `--list`.
- `.akrctx/tasks/TASK-038-refactor-preservation-gate/` — ships first. Its `refactor` suite covers
  part of `init`, `doctor`, `templates apply` and `judge`.

## Prior Findings

- Measured on this commit: nine scenarios, one suite, change types six `observability`, two `fix`,
  one `feature`. Six of the nine test the hook trace.
- `init`, `doctor`, `upgrade`, `templates`, `judge`, `impl`, `compile`, `status`, `remove` and
  `config` have **no scenario coverage**. Unit tests cover them from the inside.
- The preserve-and-suggest path — `init` into a repository that already has `CLAUDE.md` or
  `AGENTS.md` — has no end-to-end coverage. It is the behaviour `policy.json` is built around
  (`mergeStrategy: "preserve-and-suggest"`, `protectedFiles`, `protectedFileMerge`) and the one a
  user would be angriest to lose. `tests/dogfood.test.ts` checks this repository's own install,
  which is a different and weaker claim.
- The distinction that justifies this task: a unit test proving `runInit` returns the right object
  does not prove the files landed, with the right content, without clobbering a user's file. Those
  are separate claims and only the second one is what akrctx sells.
- `judge` snapshot capture reads Git state from the working tree. Whether the fixture machinery can
  produce a real Git repository is the open technical question and it gates roughly half the
  `judge` scenarios.

## Blocked Reads

- Secrets and credentials must not be read: `.env`, `.env.*`, `*.pem`, `*.key`, `*.p12`, `*.pfx`,
  `secrets/`, `credentials/`, `private/`.
- `evals/.cache/builds/` holds checked-out copies of older commits. Never edit them; `src/*.ts`
  under those paths is not current source.
- Scenarios execute the built CLI in disposable repositories. Per `evals/README.md`, scenario files
  and compared Git refs are executable code — only trusted refs are evaluated locally.
