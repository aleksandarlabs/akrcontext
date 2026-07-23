# Acceptance Criteria

- [ ] Rubric lives in `doctorBody` in `src/templates/instructions.ts`, so all four
      targets receive it from one source.
- [ ] The existing "Protected instruction merge" section is unchanged.
- [ ] The rubric records semantic findings in persistent
      `.akrctx/wiki/instruction-audit.md`; the mechanical CLI Doctor does not overwrite it.
- [ ] The rubric permits moving instructions up when globally required, detects a
      missing `applyTo`, and evaluates coherent instruction blocks rather than literal lines.
- [ ] akrctx's generated Copilot instruction uses a narrow `applyTo` and does not
      violate the rubric.
- [ ] User documentation distinguishes deterministic CLI checks from semantic skill review.
- [ ] `pnpm test` passes, including the existing
      "teaches every Doctor target the narrow human-approved merge workflow" test.
- [ ] `pnpm lint` passes at the repository root (`biome check .`, exit 0).
