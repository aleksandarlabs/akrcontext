---
type: akrctx-wiki-write-policy
title: "Write Policy"
description: "Where akrctx and agents should persist durable context."
tags: ["write-policy", "akrctx"]
timestamp: 2026-07-22T17:54:14.665Z
---

# Write Policy

akrctx keeps root instructions small and writes durable context only when it has a clear home.

## Where To Write

- Wiki index: .akrctx/wiki/index.md
- Mechanical Doctor reports: .akrctx/wiki/agent-setup.md, gaps.md, recommendations.md
- Persistent agent instruction audit: .akrctx/wiki/instruction-audit.md
- Doctor merge candidates: AGENTS.akrctx.suggested.md, CLAUDE.akrctx.suggested.md, .github/copilot-instructions.akrctx.suggested.md
- Task capsules: .akrctx/tasks/TASK-XXX/
- Compiled briefs: .akrctx/tasks/TASK-XXX/exports/<target>.md
- Architecture or process decisions: .akrctx/wiki/decisions.md
- Implementation notes for a task: .akrctx/tasks/TASK-XXX/log.md

## Cross-Links

Use bundle-relative links (`/wiki/decisions.md`) when linking between wiki pages. They remain valid if a page is moved between directories.

## Context Budget

- Do not read all of .akrctx/ by default.
- Read policy.json first when safety or merge behavior matters.
- Read the current task capsule before implementation.
- Read only wiki pages that are relevant to the current task.
- Load target workflow skills or prompts only when the task calls for them.

## Protected Instruction Merges

- Protected instructions are read-only by default.
- The Doctor agent must show the exact minimal diff before asking for approval.
- Only explicit approval of that diff in the current conversation permits the agent to edit the protected file.
- A changed proposal or target requires a new preview and approval.
- After applying the approved diff, show the result, rerun Doctor, and remove the matching suggested file only when the merge is verified.
