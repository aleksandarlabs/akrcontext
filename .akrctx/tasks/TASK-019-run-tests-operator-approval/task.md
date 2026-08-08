# Task

## Goal

Close the item-5 security finding from the 2026-08-08 audit: `akrctx judge verify
--run-tests` executes shell strings read from the very artifact under review (the capsule's
`## Validation` block) with no operator control over *what* runs. `runValidationCommand`
(`src/judge-enforcement.ts:437`) calls `execAsync(command)` (a shell) on a string sourced from
`task.md`, and the non-snapshot path runs it in the live repository tree. The double gate
`declaredAndPassing` only requires the command to appear in two files the same branch author
controls (`task.md` + the review JSON); it does not restrict content.

The audit concluded this is a trust-direction inversion: the *verification* step — whose
purpose is not to trust the reviewed artifact — executes commands authored by that artifact. The
fix is to make the operator's explicit approval the primary barrier, and to run validation only
inside a disposable worktree.

**Scope of this task: operator approval gate + `--run-tests` restricted to snapshot candidates.**

1. **Approval gate before execution.** When `--run-tests` resolves the set of commands to
   re-execute (`declaredAndPassing`, deduped, in parse order), it must not execute any of them
   until the operator has explicitly approved that exact list.
   - **Decision boundary.** `verifyJudgeRecord` does not detect a TTY and does not perform I/O.
     It accepts an injected `approve?: (commands: string[]) => Promise<boolean>` callback and
     refuses to execute when the callback is absent or resolves false. TTY detection, printing
     and prompting live in `src/cli/judge.ts`, where the rest of this repo keeps interactive
     concerns (`normalizeOptions` already computes `nonInteractive` in `cli/shared.ts`). This
     keeps terminal I/O out of the enforcement module and lets the tests pass a fake callback
     instead of patching `process.stdin`.
   - **TTY (CLI):** print the exact command list (one numbered line per command, verbatim as
     parsed and trimmed by `readValidationDeclaration`) and prompt y/N. Anything other than an
     affirmative response → no command executes; the result is not approved; exit code is
     non-zero; a reason names the withheld commands.
   - **Non-TTY / headless (CLI):** require `--approve-commands`, a **repeatable** flag — one
     occurrence per command, in declared order. Not comma-separated: declared commands legitimately
     contain commas (`vitest run --reporter=default,json`, `pnpm -r --filter=a,b test`,
     `node -e "const [a,b] = x"`) and a CSV encoding with no defined escape would make those
     commands permanently unapprovable. Absent, or any byte-for-byte mismatch (after the same trim
     `readValidationDeclaration` applies) against the declared list → no command executes; a reason
     lists the expected commands **and the exact copy-pasteable invocation**; exit code is
     non-zero. The prompt is never synthesized in headless mode.
2. **`--run-tests` requires a snapshot candidate.** Re-execution runs only against a
   `SNAPSHOT:<id>` candidate, in the disposable copy `createJudgeSnapshotValidationWorkspace`
   already produces. A record whose candidate is `WORKTREE` or a bare commit ref is refused with a
   reason telling the operator to capture a snapshot first; exit code is non-zero. This removes the
   remaining path that executed in the live repository tree, without reimplementing snapshot
   capture: `git worktree add` cannot materialize a `WORKTREE` candidate (there is no commit) and
   for a commit ref it would arrive without the dependency layout the snapshot machinery exists to
   carry. Requiring a snapshot makes the isolation guarantee unconditional and matches the flow
   `CLAUDE.md` already documents as correct.
3. **No allowlist / denylist.** Per the human's decision (2026-08-08), a content allowlist or
   denylist is explicitly **not** added. An allowlist of `npm`/`pnpm`/`npx`/`node` does not close
   the hole (`pnpm run`, `node -e`, `npx <pkg>` all RCE through `execFile` without shell), and a
   denylist of exact forms (`rm -rf /`, `curl|sh`) filters only the anticipated spelling and
   breeds false confidence that degrades the one gate that works — operator attention. The
   approval gate is the sole control.
4. **Breaking change documented.** `--run-tests` now refuses to execute in headless mode without
   `--approve-commands`, and refuses entirely on a non-snapshot record. Both are breaking changes
   to a flag's behavior and to exit codes; they are recorded in `CHANGELOG.md` under an
   Unreleased/Breaking heading.

## Validation

```
pnpm build && npx vitest run
```

## Out Of Scope

- A SO-level sandbox (containers, seccomp, landlock). Out of scope for a Node CLI; the project
  stance is that policy is prompt-level and does not resist a determined adversary.
- Replacing `execAsync` (shell) with `execFile` + argv parsing. Shell features (`&&`, pipes, env
  inline) are legitimately used by declared validation commands; the approval gate is the
  control, not the invocation shape.
- A disposable-worktree path for non-snapshot candidates (`withValidationWorkspace`). Rejected —
  see `## Clarifications`; `--run-tests` refuses non-snapshot records instead.
- A content allowlist/denylist of executables or patterns (rejected by design — see Goal §3).
- Storing `policy.json`-sourced allowlists. A trust control cannot live in the artifact under
  review.
- Changing the judge review schema (`JudgeReviewRecord`) or `JUDGE_SCHEMA_VERSION`. The approval
  gate is a `verify`-time CLI concern; it adds no field to the record.
- Touching snapshot capture, snapshot IDs, `judge current`, or the comprehension gate.
- Bumping dependencies (Frente A — handled separately, already applied to the working tree).

## Clarifications

### Session 2026-08-08

- The approval gate is the **primary and only** control. No allowlist/denylist is added, even as
  defense in depth. Rationale: a denylist of anticipated spellings (`rm -rf /`, `curl|sh`) filters
  only the exact form an attacker would simply re-spell, and its visible presence makes the
  operator approve with less attention — degrading the one barrier that actually works.

- Non-TTY detection follows Node's `process.stdin.isTTY` and lives in `src/cli/judge.ts`, not in
  `verifyJudgeRecord`. When `--run-tests` is set and stdin is not a TTY, `--approve-commands` is
  **required**; the interactive prompt is never synthesized in headless mode. This makes CI
  pipelines fail loud rather than hang or silently trust. The enforcement module stays free of
  terminal I/O and receives only an `approve` callback.

- `--approve-commands` is a **repeatable** flag (one occurrence per command), not a
  comma-separated list. A CSV encoding has no defined escape, so any declared command containing a
  comma — `vitest run --reporter=default,json`, `pnpm -r --filter=a,b test`,
  `node -e "const [a,b] = x"` — would be permanently unapprovable. A repeatable flag preserves
  order, needs no quoting rules and has no unrepresentable input.

- Approved commands are compared **byte-for-byte** against the declared commands after the same
  normalization `readValidationDeclaration` already applies (line trim, dedupe, drop
  comments/blank lines). Order matters: a reordering is a mismatch and a refusal. Rationale: order
  sensitivity has no security value on its own — the same set would run either way — but it forces
  the operator to **paste the list that was printed**. An order-insensitive (set) comparison would
  let the operator hand-assemble the list, which reintroduces "typed something plausible" in place
  of "confirmed what was shown", and that confirmation is the whole control.

- `--run-tests` requires a `SNAPSHOT:<id>` candidate; `WORKTREE` and bare commit refs are refused.
  Making the non-snapshot path use a disposable worktree instead was considered and rejected as
  not implementable without duplicating snapshot capture: `createJudgeSnapshotValidationWorkspace`
  copies an existing snapshot directory, `git worktree add` cannot materialize a dirty `WORKTREE`
  candidate because there is no commit, and for a commit ref the worktree would arrive without
  `node_modules`, so `pnpm test` would fail — the dependency-layout handling in the snapshot code
  exists precisely for this. Refusing is one branch instead of a second capture implementation,
  and it makes isolation unconditional rather than best-effort.

- `--approve-commands` is ignored (not required) when `--run-tests` is not set. It is only
  meaningful as the headless counterpart to the TTY prompt.

## Open Questions

- None recorded yet.