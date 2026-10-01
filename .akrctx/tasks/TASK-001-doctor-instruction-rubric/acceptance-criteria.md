# Acceptance Criteria

- AC-1: [ ] Rubric lives in `doctorBody` in `src/templates/instructions.ts`, so all four
      targets receive it from one source.
- AC-2: [ ] The existing "Protected instruction merge" section is unchanged.
- AC-3: [ ] The rubric records semantic findings in persistent
      `.akrctx/wiki/instruction-audit.md`; the mechanical CLI Doctor does not overwrite it.
- AC-4: [ ] The rubric permits moving instructions up when globally required, detects a
      missing `applyTo`, and evaluates coherent instruction blocks rather than literal lines.
- AC-5: [ ] akrctx's generated Copilot instruction uses a narrow `applyTo` and does not
      violate the rubric.
- AC-6: [ ] User documentation distinguishes deterministic CLI checks from semantic skill review.
- AC-7: [ ] `pnpm test` passes, including the existing
      "teaches every Doctor target the narrow human-approved merge workflow" test.
- AC-8: [ ] `pnpm lint` passes at the repository root (`biome check .`, exit 0).
