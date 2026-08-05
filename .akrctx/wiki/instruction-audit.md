---
type: akrctx-wiki-instruction-audit
title: "Instruction Audit"
description: "Persistent semantic audit of agent instruction placement."
tags: ["instructions", "doctor", "audit"]
timestamp: 2026-07-23T07:05:48.217Z
---

# Instruction Audit

The Doctor agent records semantic instruction findings here. Unlike the CLI-generated readiness reports, `akrctx doctor` does not overwrite this page.

For each instruction or coherent block, record its current tier, verdict (keep, move, delete, or verify), evidence, and proposed destination when applicable.

## Audit — 2026-08-05

### Root project context and key constraints in `AGENTS.md`

- **Current tier:** Always loaded
- **Verdict:** keep
- **Evidence:** These constraints describe this repository's generated-template boundary, version source of truth, harness-file registry, and policy constraints. They are not reliably discoverable before an edit.
- **Destination:** `AGENTS.md`

### Proposed harness workflow in `AGENTS.akrctx.suggested.md`

- **Current tier:** Pending protected-file suggestion
- **Verdict:** move
- **Evidence:** The implementation gate, clarification rule, workflow selection, independent review, and safety rules govern all meaningful code changes and must be known before discovery or action. The suggested file must not replace the repository-specific root instructions.
- **Destination:** Merge the non-duplicative global rules into `AGENTS.md`, retaining the existing project context and constraints.

### Proposed write-policy block in `AGENTS.akrctx.suggested.md`

- **Current tier:** Pending protected-file suggestion
- **Verdict:** move
- **Evidence:** The detailed path mapping already lives in `.akrctx/wiki/write-policy.md` and is only needed when persisting an artifact. Keeping the full block in the root would duplicate a loaded-on-demand document.
- **Destination:** `.akrctx/wiki/write-policy.md` (already present); include only a short root reference if a root merge needs one.

### Current handoff commands in `AGENTS.md`

- **Current tier:** Always loaded
- **Verdict:** keep
- **Evidence:** These are the exact, repository-specific validation commands required before handoff.
- **Destination:** `AGENTS.md`
