# Review Checklist

- [x] Goal is clear.
- [x] Scope is controlled.
- [x] Tests or validation commands are defined.
- [x] Existing instructions were not overwritten.
- [x] No blocked path is read, hashed, or handed to the judge.
- [x] Nothing from a review record reaches a shell; only capsule-declared commands run.
- [x] Contract version bump is consistent across schema, validator, and `requireJudgeContract`.
- [x] Generated files regenerated via `akrctx upgrade`; a second run wrote nothing.
- [x] `pnpm test` passes — 208/208, 18 new judge tests.
- [x] `pnpm lint` passes at repo root — `biome check .`, 39 files, exit 0.

## Second review round

An independent review of the branch raised five findings. All five were accepted.

- **`--run-tests` could approve a boundary it had itself invalidated.** Real bug,
  introduced by this task. The scope was computed before execution and never
  recomputed, so a formatter, snapshot update or codegen step could exit 0, rewrite
  the worktree, and still print "APPROVED and current". `boundaryDrift` now recomputes
  after every command and rejects movement in any scope field. Test:
  "--run-tests rejects a command that passes but moves the boundary it approved".
- **The trust boundary was described incorrectly.** The code comment claimed `task.md`
  is human-authored "like package.json scripts". It is not — the harness instructs the
  agent to write the capsule. `--run-tests` moves trust from the record to the capsule
  rather than removing it, and is not a defence against a compromised primary agent,
  which could author both. Corrected in the comment, `docs/JUDGE.md`, the shipped
  contract, and the CLI help.
- **The strong check was not in the normal flow.** The primary-agent instructions now
  use `--run-tests`, and the comprehension agent is explicitly told not to — it would
  break its read-only contract. Added a table in `docs/JUDGE.md` placing the check with
  the trusted caller, and stating that a re-execution result does not survive a handoff.
- **The declared-command rule failed permissive.** A capsule with a `## Validation`
  section but an empty block was indistinguishable from a legacy capsule. Now
  `sectionPresent` separates them: no section means legacy and permissive; an empty or
  malformed block means unfinished and rejects APPROVED.
- **Blocked-pattern reading failed open.** A `policy.json` with a missing or wrongly
  typed `blockedReadPatterns` silently yielded zero protection, and the hardcoded
  fallback would have dropped strict/regulated additions. `readBlockedPatterns` now
  throws. Two tests cover malformed JSON and a wrong-typed field.

Also corrected: `README.md` claimed all of `blockedReadPatterns` is convention-level,
which this task made partly untrue. It now names the judge boundary as the one place
the patterns are enforced mechanically, and leaves the rest of the section standing.

## Third review round

The reviewer accepted #1, #2, #4 and #5 and found #3 only half-applied. Correct on both
counts.

- **Two instruction surfaces still carried the weak form.** The fix had only touched the
  root instruction body; the `akrctx-workflow` skill body at
  `src/templates/instructions.ts:219` still said plain `judge verify`, so a new install
  gave the agent contradictory instructions depending on which surface it loaded. A
  third surface the reviewer did not name — the shipped `.akrctx/judge/README.md` — had
  the same problem, and a fourth (the judge agent's own description of what the caller
  does) was inaccurate for the same reason. All four now say `--run-tests`.
- **The strong check was gated on the wrong condition.** Saving and verifying the record
  sat inside `comprehensionGate.enabled`, so with judge on and comprehension off — this
  repo's own configuration — nothing obliged the agent to verify at all. Moved to the
  general `judge.enabled` flow on both surfaces; `comprehensionGate.enabled` now governs
  only the handoff.
- **Regression test added.** "never leaves a weak judge verify in an instruction aimed at
  the primary agent" walks every generated `.md`/`.toml` surface and fails on any line
  containing `judge verify` without `--run-tests`, excluding the two read-only agents. It
  caught the shipped contract file that manual review had missed. A companion test pins
  that the comprehension agent is still told *not* to pass the flag.

**Documentation residue, also correct.** `src/task.ts` and `src/templates/wiki.ts` told
capsule authors that `--run-tests` "re-runs exactly this list". It runs the intersection
of declared commands and commands the record claims passed. Reworded to say it re-runs
the ones the review claims passed, and that nothing outside the list is ever executed —
which is the property that actually matters to whoever fills in the block.

## Notes

**Behavior change, called out.** An untracked file matching `blockedReadPatterns` used
to abort scope computation entirely. It now excludes and reports instead. The old
behavior looked safer but failed on `.env.example`, which `.env.*` matches and which is
not a secret — a common file that would have made the judge unusable in many repos.
The test that pinned the abort was rewritten to pin the exclusion.

**Breaking contract change, called out.** The review contract moved from v1 to v2.
Existing v1 records stop verifying. This is acceptable because records are bound to a
worktree state that has already moved by the time a version changes; the one record in
`.akrctx/local/judge/` was already invalid on boundary grounds.

**Not regenerated:** `.akrctx/tasks/_template/task.md` in this repo still lacks the
`## Validation` section. `akrctx upgrade` deliberately preserves everything under
`tasks/`, which is correct — an upgrade must not rewrite task capsules. New installs
get the section from `src/templates/wiki.ts`. Hand-editing the local copy would
contradict the "never hand-edit generated output" convention, so it was left alone.
It is inert either way: `runTask` generates from `src/task.ts`, not from `_template`.

**Pre-existing, untouched:** `pnpm exec tsc --noEmit` reports errors in `src/doctor.ts`
(3) and `tests/akrctx.test.ts` (6, all in the compile suite around line 834). None are
in files this task changed. The repo gate is `biome`, not `tsc`, and `tsup` builds
clean. Logged here rather than fixed silently.

## Follow-up

**Version bump is a release decision, not taken here.** The review contract is now v2
while `src/version.ts` and `package.json` are still `0.3.0`. Provenance in
`scope.cliVersion` is only as sharp as the version it records, so the release task must
bump the package before this ships — two different contracts would otherwise both
report `v0.3.0` and verify against each other.

**Protected file not edited.** The primary-agent instruction change produced an upgrade
candidate at `.akrctx/upgrades/0.3.0/CLAUDE.md` instead of editing `CLAUDE.md`, which is
correct: protected instructions are deny-by-default and need explicit human approval for
that exact diff. Until it is approved, this repo's own `CLAUDE.md` still tells the agent
to run plain `judge verify`. New installs get the updated text from
`src/templates/instructions.ts`.

The residual trust gap stays open by design and is now documented in
`docs/JUDGE.md` and the shipped `.akrctx/judge/README.md` rather than implied away.
Closing it needs a trust anchor outside the repository — a CI-held signing key, not
anything an agent can reach. That is a separate task if it is ever wanted.
