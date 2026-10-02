# Context

Config: task-fit workflow, judge enabled, comprehension gate disabled. This repository lands
work as direct commits on main. Shipped harness content lives in src/templates. Managed files
use CLI regeneration; existing capsule templates currently remain on the preserve path until
TASK-079 is implemented.

## Relevant Files

- `src/task.ts` — `showTask` holds the extraction regular expression that reads task.md.
  `taskMarkdown` writes the `## Recommended Workflow` heading; `planMarkdown` writes the
  `## Workflow` section that capsules actually use.
- `src/templates/wiki.ts` — `capsuleTemplates["plan.md"]` ships `## Workflow` with a bullet
  value, which is a third shape the reader must tolerate.
- `src/cli/task.ts` — the `show` subcommand prints the workflow, or `unknown` when absent.
- `src/config.ts`, `.akrctx/config.json` — `defaults.allowedWorkflows`, `defaults.workflow`
  set to task-fit, and `defaults.requireWorkflowReason` set to true.
- `.akrctx/tasks/TASK-07*/plan.md` — recent examples. They write the workflow as prose on its
  own line, then a `Reason:` paragraph.
- `.akrctx/tasks/_template/plan.md` — ships `## Workflow` with `- research-first` as a bullet.

## Prior deliveries

- TASK-069 corrected workflow selection by intention.
- TASK-075 is one of the capsules the current reader cannot read.

## Blocked Reads

- Secrets and credentials must not be read.
