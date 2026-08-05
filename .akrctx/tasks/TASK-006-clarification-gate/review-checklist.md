# Review Checklist

- [x] Goal is clear.
- [x] Scope boundaries are explicit.
- [x] Relevant files were inspected.
- [x] Secrets and blocked paths were avoided.
- [x] Tests or validation commands were run or documented. `pnpm test` (583) and
      `pnpm lint` pass and are declared under `## Validation`. `pnpm build` and
      `pnpm eval` were run by the implementer but are not declared, so the judge did
      not re-run them.
- [x] Existing instruction files were not overwritten. `CLAUDE.md` is protected and was
      edited only after the exact diff was shown and approved in conversation; the judge
      confirmed the result is byte-identical to `mainInstructionTemplate("claude")`.
- [x] `capsuleFiles` is unchanged; no new capsule file was introduced.
- [x] The generated `task.md` is deterministic — no date, no clock dependency.
      Asserted by "produces byte-identical task.md across runs".
- [x] Capsules created before this change still parse and still verify. Asserted by
      "reports a capsule written before this section existed without erroring".
- [x] Nothing new blocks: `judge verify` exit codes are unchanged by open questions.
      Asserted by "reports unresolved open questions as a notice without blocking
      approval".
- [x] Skill text is identical across all four targets. Now asserted by two tests
      ("emits the same akrctx-task skill text to all four targets" and "names the native
      question UI in the claude target reference only"), so a future regression fails the
      suite instead of relying on the byte-for-byte check the judge ran by hand.
- [x] Every instruction that asks for an entry demands the top-level `- ` bullet the
      parser reads, and a bare-paragraph entry is pinned as invisible by a test.
