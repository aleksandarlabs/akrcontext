---
name: akrctx-workflow
description: Use when selecting or applying SDD, TDD, EDD, research-first, fast-patch, UI review, or combined workflows.
---

# akrctx-workflow

Use the workflow named in the task capsule.

## fast-patch

1. Load only the files directly touched by the change.
2. Make the smallest safe edit that satisfies the goal.
3. Verify the change does not break adjacent behavior.
4. No spec or new tests unless they already exist.

## research-first

1. Read .akrctx/config.json, policy.json, and relevant wiki pages without modifying code.
2. Inspect relevant files, git log, and .akrctx/wiki/decisions.md.
3. List open questions and areas of uncertainty in the task capsule.
4. Propose an approach and wait for user confirmation before implementing.
5. Switch to a concrete workflow (TDD, SDD, etc.) for implementation.

## SDD

1. Write or update the behavior contract: inputs, outputs, preconditions, postconditions, and explicit out-of-scope boundaries.
2. Record the contract in the task capsule before touching implementation files.
3. Implement only what the contract specifies.

## TDD

1. Write failing tests that encode the expected behavior. Confirm they fail for the right reason.
2. Implement the minimum code to make the tests pass.
3. Refactor if needed, keeping tests green.

## EDD

1. Define concrete examples and edge cases: happy paths, empty inputs, boundary values, unexpected combinations.
2. Record examples in the task capsule.
3. Implement against those examples.

## SDD+TDD

1. Write the behavior contract (SDD).
2. Encode the contract as failing tests (TDD).
3. Implement until tests pass.

## SDD+EDD

1. Write the behavior contract (SDD).
2. Define examples and edge cases that illustrate the contract (EDD).
3. Implement against contract and examples.

## TDD+EDD

1. Define examples and edge cases (EDD).
2. Encode each example as a failing test (TDD).
3. Implement until tests pass.

## UI review

1. Check for existing UI conventions in project instructions or .akrctx/wiki/conventions.md. If the project defines its own UI review process, follow it instead.
2. Discover which tools are present: stylelint, eslint with style or a11y rules, storybook, playwright, cypress, chromatic, percy, or any browser preview command in package.json scripts.
3. Run the tools that are available. Do not skip tools without noting why.
4. Report findings ordered by severity. Reference file and line where possible.
5. Do not modify code unless the user explicitly asks for fixes after the review.

Do not expand into a heavyweight process unless the task capsule or user explicitly asks for it.

## Judge (optional)

If `judge.enabled` is `true` in `.akrctx/config.json`, after completing implementation offer the user the option to invoke the `akrctx-judge` subagent for independent review. The judge reads the task capsule and changed code and reports APPROVED / NEEDS CHANGES / BLOCKED. Do not invoke it automatically; wait for explicit confirmation.

When a review comes back, save the judge's exact JSON record under `.akrctx/local/judge/` and run `akrctx judge verify <review.json> --run-tests` before acting on the verdict. Do this whenever the judge runs, not only when comprehension is enabled — an unverified verdict is an unchecked claim, and without `--run-tests` the CLI takes the judge's word that validation passed. You are the trusted caller: the judge and the comprehension agent are read-only and cannot execute anything, so this check exists here or nowhere. It runs the commands the capsule's `task.md` declares, so read that file first on work you did not supervise.

If `comprehensionGate.enabled` is also true, offer the independent `akrctx-comprehension` agent only when that verification says the approval is current. If the judge is disabled, disclose that no independent correctness review exists before offering comprehension. Pass only the task ID, exact base/candidate boundary, and verified judge-record path to the comprehension agent. Never pass your implementation narrative, explanations, suggested questions, or expected answers. The comprehension agent owns all teaching, questions, answers, and learning artifacts in its separate context.
