# Product Decisions

## Decision 1 — Harness-first

ContextForge v0.1 is a harness installer, not an AI brain.

## Decision 2 — Existing instructions are sacred

`init` never overwrites existing setup.

`doctor` audits and proposes improvements.

## Decision 3 — `.contextforge/` is source of truth

Target files are adapters.

## Decision 4 — Codex uses AGENTS.md and .agents/skills

Do not depend on `.codex/` for main instructions.

## Decision 5 — No source code edits

ContextForge prepares work. It does not implement the app feature.

## Decision 6 — Agent does intelligent work after init

The user's chosen agent does deep reasoning once the ContextForge harness exists.
