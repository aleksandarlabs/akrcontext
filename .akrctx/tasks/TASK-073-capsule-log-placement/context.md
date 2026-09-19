# Context

The contradiction, verified by reading the source on 2026-09-19.

Says the log belongs in the capsule: src/templates/instructions.ts:83, src/templates/wiki.ts:181, src/templates/defaults.ts:104 (which generates policy.json writePolicy.implementationNotes), and the installed CLAUDE.md:47.

Says the log belongs in Git-ignored local storage: src/templates/implementer.ts:20 (the implementer is told to read `.akrctx/local/impl/TASK-XXX/log.md`), src/impl.ts (the design rationale, which calls the placement load-bearing), docs/CONFIGURATION.md:338, docs/COMMANDS_AND_UX.md:301.

The practical effect: the implementer reads a log that the write policy sends somewhere else. 22 of 71 capsules already hold a `log.md`, so the implementing agent's own account of its work sits in the diff the judge reads. The judge contract forbids treating that account as evidence.

TASK-051 already settled the adjacent question and must not be reopened: `review-checklist.md` stays in `taskDigest`, the checklist is completed before the snapshot, and the verified judge record is the evidence that review finished.

`.akrctx/policy.json` lists CLAUDE.md, AGENTS.md, .github/copilot-instructions.md and .pi/README.md as protected, with `agentMayEdit: after-explicit-human-approval`, `approvalScope: current-conversation` and `requireDiffPreview: true`.

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands work as direct commits on main. Installed harness files are regenerated from src/templates, never hand-edited.
