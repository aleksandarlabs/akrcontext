# TASK-079 — Close the capsule-template drift in upgrade

## Goal

Make `akrctx upgrade` manage the five capsule template files through its existing provenance
and upgrade-candidate path. Verified untouched templates follow shipped content; personalized
templates and differing templates without provenance are preserved and offered candidates.
`upgrade --dry-run` reports differences without a second sync command.

## Problem evidence
`upgrade` treats the capsule template as project-owned knowledge. In `src/upgrade.ts`,
`preserveProjectKnowledge` writes a file only when it is absent and otherwise records
`{ kind: "preserve", reason: "Project-owned knowledge is never overwritten." }`. The
`taskTemplateFiles` entries pass through that same path, so an existing
`.akrctx/tasks/_template/acceptance-criteria.md` is never updated.

TASK-075 hit this. Its upgrade plan listed eight files and silently omitted the capsule
template, although the template literal in `src/templates/wiki.ts` had changed. The agent
regenerated the installed file by decoding the TypeScript string literal with a Python script.
That is not a workflow.

The same task's `context.md` asserts: "Installed harness files are regenerated from
src/templates, never hand-edited." For the capsule template that is false today, and nothing
detects the drift.

## Contract

- Only `.akrctx/tasks/_template/<capsuleFiles entry>` joins the managed-file class. Project
  wiki content and actual task capsules keep their existing ownership.
- `isManifestManagedPath` currently excludes capsule templates, and the repository manifest
  contains no hashes for them. Fresh installs must record their provenance after this fix.
- Missing templates are created. Templates already identical to desired content may acquire
  that content hash without being rewritten.
- When current content matches a recorded installed hash, upgrade may update it to the shipped
  template and record the new hash.
- Differing content without a matching provenance hash is preserved, whether personalized,
  untracked historically or associated with an invalid manifest. Use the existing versioned
  upgrade-candidate path; never infer ownership by similarity to an old template.
- `upgrade --dry-run` names differing template paths and planned updates or candidates while
  leaving both installed files and provenance unchanged.
- Fresh and upgraded content is identical only for installations eligible for automatic
  update or after a candidate is explicitly accepted. Personalized installations may differ.

## Validation
```
pnpm build
pnpm test
pnpm lint
pnpm akrctx init --target codex --dry-run
pnpm akrctx doctor --json
```

## Out Of Scope

- Overwriting personalized or differing unprovenanced templates without consent.
- Managing project wiki knowledge or actual task capsules as generated templates.
- A new merge algorithm, template sync command or heuristic historical-provenance recovery.

## Clarifications

Ambiguity resolved with the human before implementation. One answer per top-level `- ` bullet.

### Session 2026-10-01
- The user requested corrections to these capsules after the design review. This revision
  applies the scope and consistency corrections from that review; it does not implement the
  proposed CLI features. Unresolved contract choices remain under Open Questions.

## Open Questions

The existing managed-file conflict contract is reused.

- None.
