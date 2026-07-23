# Context

## Relevant Files

- `src/templates/instructions.ts:94` — `doctorBody`, the single source for the Doctor
  skill body. Rendered into `.agents/skills/`, `.claude/skills/`, `.github/skills/`,
  and `.pi/skills/` by `skillFiles()` at line 200.
- `src/templates/instructions.ts:184` — registration of `akrctx-doctor` with its
  description in `sharedSkills`.
- `tests/akrctx.test.ts:180` — asserts every Doctor surface still contains
  "explicit human approval", "current conversation", "Show the exact proposed diff",
  "apply only the shown changes", and "Never use `--force`". The edit must be purely
  additive with respect to these strings.
- `src/templates/defaults.ts` — `writePolicy.doctor` bounds where Doctor may write:
  the three generated readiness pages, persistent `instruction-audit.md`, and the
  three `*.akrctx.suggested.md` files.
- `src/templates/wiki.ts` and `src/harness-files.ts` — source and required-file
  inventory for the persistent semantic instruction audit.
- `src/doctor.ts:505` — the mechanical CLI Doctor regenerates `agent-setup.md`,
  `gaps.md`, and `recommendations.md`; it must not overwrite `instruction-audit.md`.
- `docs/COMMANDS_AND_UX.md` and `docs/HARNESS_SPEC.md` — user-facing distinction
  between deterministic CLI checks and semantic skill review.
- `.akrctx/policy.json:5` — `protectedFiles`. `src/templates/instructions.ts` is not
  protected, so this edit needs no merge approval.

## Origin

The rubric is adapted from the `agent-manifest` skill at
`/Users/alex/code/agent-manifest`. Only the criteria are being taken: tiers, verdicts,
include/exclude, and routing-metadata checks. Deliberately excluded:

- its research/citations section (contains a contested reading of arXiv 2602.11988)
- its output format and platform tables (akrctx already models targets)
- its file-editing behavior, which lacks a human approval step — akrctx's protected
  merge protocol is the stronger half and stays as-is

## Blocked Reads

- Secrets and credentials must not be read.
