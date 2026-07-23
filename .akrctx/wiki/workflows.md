---
type: akrctx-wiki-workflows
title: "Workflows"
description: "Supported akrctx workflows and selection policy."
tags: ["workflows", "akrctx"]
timestamp: 2026-07-22T17:54:14.665Z
---

# Workflows

Use akrctx task capsules before implementation.

## Project Default

The project default lives in .akrctx/config.json:

- defaults.workflow: task-fit means choose the smallest workflow that fits the task.
- defaults.requireWorkflowReason: true means each task capsule should explain why the workflow was chosen.
- defaults.contextBudget: proportional means load only context that is useful for the current task.

## Supported Labels

- fast-patch
- research-first
- SDD
- TDD
- EDD
- SDD+TDD
- SDD+EDD
- TDD+EDD
- UI review (auto-assigned for UI tasks, not a user-selectable default)

## Selection Policy

- Use fast-patch for small, low-risk changes.
- Use TDD for bugs, regressions, and testable logic changes.
- Use SDD for APIs, contracts, schemas, permissions, and behavior specifications.
- Use SDD+TDD for new or changed contracts that need executable tests.
- Use EDD for examples, edge cases, and ambiguous rules.
- Use SDD+EDD for domains with many examples or boundary cases.
- Use research-first when the relevant area is unknown.
- Use UI review for UI validation tasks (discovers stylelint, storybook, playwright, etc.).
