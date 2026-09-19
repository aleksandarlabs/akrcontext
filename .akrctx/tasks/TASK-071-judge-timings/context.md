# Context

Relevant source: src/cli/judge.ts, src/judge-enforcement.ts, src/judge-snapshot.ts, src/templates/instructions.ts, src/templates/judge.ts. Current judge runs tests and trusted caller repeats them; this delivery measures that behavior without removing it. CLI does not orchestrate the external agent. Config uses task-fit, judge enabled, comprehension disabled. Installed harness files must be regenerated, never hand-edited.
