---
type: akrctx-wiki-overview
title: "Overview"
description: "Project overview for akr-context."
tags: ["overview", "akrctx"]
timestamp: 2026-07-22T17:54:14.670Z
---

# Overview

**Project:** akr-context
**akrctx version:** 0.3.0
**Installed targets:** claude

This repository uses akrctx as an agentic workflow harness. The `.akrctx/` directory is the neutral source of truth.

## Quick Reference

- Workflows: fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, SDD+EDD, TDD+EDD, UI review
- Default workflow: read from `.akrctx/config.json` → `defaults.workflow`
- Task capsules: `.akrctx/tasks/TASK-XXX/`
- Wiki: `.akrctx/wiki/` (populated by `akrctx doctor`)

## Next Steps

Ask your agent: "Run akrctx doctor." It will audit this setup and populate the wiki.
