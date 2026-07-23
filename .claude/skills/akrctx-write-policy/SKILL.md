---
name: akrctx-write-policy
description: Use when deciding where akrctx should persist wiki notes, task notes, decisions, or compiled briefs.
---

# akrctx-write-policy

Write durable context only to the paths in .akrctx/wiki/write-policy.md. Keep the wiki alive: update architecture.md, conventions.md, testing.md, and decisions.md as the project evolves. Protected instructions remain read-only except for the narrow Doctor merge defined by policy.protectedFileMerge: show the exact diff, receive explicit approval in the current conversation, then apply only that diff. Do not read all of .akrctx/ by default. Prefer the active task capsule, policy.json, and only relevant wiki pages.
