import path from "node:path";
import { normalizeWorkflow as normalizeConfigWorkflow, readConfig } from "./config.js";
import { listDirs, pathExists, writePlannedFile } from "./fs-utils.js";
import type { CommandOptions, ContextForgeConfig, Workflow } from "./types.js";

export interface TaskResult {
  taskId: string;
  taskDir: string;
  workflow: string;
  writes: string[];
}

export async function runTask(description: string, options: CommandOptions): Promise<TaskResult> {
  const cwd = options.cwd ?? process.cwd();
  const tasksRoot = path.join(cwd, ".contextforge/tasks");
  const taskId = await nextTaskId(tasksRoot, description);
  const slug = slugify(description);
  const taskDir = `.contextforge/tasks/${taskId}-${slug}`;
  const config = await readConfig(cwd);
  const workflow = selectWorkflow(description, options.workflow, config);
  const workflowSource = options.workflow ? "explicit CLI override" : config?.defaults.workflow === "task-fit" || !config ? "project task-fit rules" : "project default";
  const writes: string[] = [];

  const write = async (relative: string, content: string) => {
    const result = await writePlannedFile(cwd, path.posix.join(taskDir, relative), content, {
      dryRun: options.dryRun,
      force: options.force,
      reason: "ContextForge task capsule file.",
    });
    writes.push(result.path);
  };

  await write("task.md", taskMarkdown(taskId, description, workflow, workflowSource));
  await write("context.md", contextMarkdown());
  await write("plan.md", planMarkdown(workflow));
  await write("acceptance-criteria.md", acceptanceMarkdown(description));
  await write("review-checklist.md", reviewMarkdown());
  await write("exports/README.md", "# Exports\n\nRun `contextforge compile <taskId> --target <target>` to create agent-specific briefs.\n");

  return { taskId, taskDir, workflow, writes };
}

async function nextTaskId(tasksRoot: string, description: string): Promise<string> {
  const dirs = await listDirs(tasksRoot);
  const numbers = dirs
    .map((dir) => /^TASK-(\d+)/.exec(dir)?.[1])
    .filter((value): value is string => Boolean(value))
    .map((value) => Number(value));
  const next = numbers.length ? Math.max(...numbers) + 1 : 1;
  return `TASK-${String(next).padStart(3, "0")}`;
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "task";
}

export function recommendWorkflow(description: string): string {
  const text = description.toLowerCase();
  if (/\bsdd\W*edd\b|\bedd\W*sdd\b/.test(text)) return "SDD+EDD";
  if (/\bsdd\W*tdd\b|\btdd\W*sdd\b/.test(text)) return "SDD+TDD";
  if (/\bedd\b|example|edge case|edge-case\b/.test(text)) return "EDD";
  if (/\bsdd\b|\bapi|schema|contract|spec\b/.test(text)) return "SDD";
  if (/\btdd\b|\btest|bug|fix|regression\b/.test(text)) return "TDD";
  if (/\bui|screen|page|component|design|tabs\b/.test(text)) return "UI review";
  if (/\bresearch|investigate|unknown|spike\b/.test(text)) return "research-first";
  return "fast-patch";
}

export function normalizeWorkflow(workflow: string | undefined): Workflow | undefined {
  const resolved = normalizeConfigWorkflow(workflow);
  if (workflow && !resolved) {
    throw new Error(`Unsupported workflow: ${workflow}. Use fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, SDD+EDD, or TDD+EDD.`);
  }
  return resolved;
}

function selectWorkflow(description: string, explicitWorkflow: string | undefined, config: ContextForgeConfig | undefined): Workflow | "UI review" {
  const explicit = normalizeWorkflow(explicitWorkflow);
  if (explicit) return explicit;
  if (config?.defaults.workflow && config.defaults.workflow !== "task-fit") return config.defaults.workflow;
  return recommendWorkflow(description) as Workflow | "UI review";
}

function taskMarkdown(taskId: string, description: string, workflow: string, workflowSource: string): string {
  return `# ${taskId}

## Goal

${description}

## Recommended Workflow

${workflow}

## Workflow Notes

- Workflow source: ${workflowSource}.
- Why this workflow: fill this in before implementation if the reason is not obvious.
- Keep context loading proportional. Do not read all of .contextforge/ unless the task requires it.

## Out Of Scope

- LLM API integration.
- Telemetry.
- External agent execution.
- Source-code changes outside the approved implementation task.

## Open Questions

- None recorded yet.
`;
}

function contextMarkdown(): string {
  return `# Context

## Relevant Files To Inspect

- README.md
- package.json
- .contextforge/wiki/
- .contextforge/policy.json
- .contextforge/wiki/write-policy.md

## Blocked Reads

- .env
- .env.*
- *.pem
- *.key
- secrets/
- credentials/
- private/
`;
}

function planMarkdown(workflow: string): string {
  return `# Plan

## Workflow

${workflow}

## Steps

1. Read this task capsule and .contextforge/policy.json.
2. Load only the workflow skill or prompt matching ${workflow}.
3. Inspect only files needed for the task.
4. Confirm acceptance criteria and validation commands.
5. Implement within scope.
6. Run quality gates.
7. Review for instruction overwrite, secret handling, and source-code boundaries.
`;
}

function acceptanceMarkdown(description: string): string {
  return `# Acceptance Criteria

- The requested outcome is implemented: ${description}
- Existing agent instruction files are preserved unless a human approves a merge.
- Relevant validation commands are documented or run.
- The review checklist is completed before handoff.
`;
}

function reviewMarkdown(): string {
  return `# Review Checklist

- [ ] Goal is clear.
- [ ] Scope boundaries are explicit.
- [ ] Relevant files were inspected.
- [ ] Secrets and blocked paths were avoided.
- [ ] Tests or validation commands were run or documented.
- [ ] Existing instruction files were not overwritten.
`;
}

export async function findTaskDirectory(cwd: string, taskId: string): Promise<string | undefined> {
  const tasksRoot = path.join(cwd, ".contextforge/tasks");
  const dirs = await listDirs(tasksRoot);
  const match = dirs.find((dir) => dir === taskId || dir.startsWith(`${taskId}-`));
  if (!match) return undefined;
  const relative = `.contextforge/tasks/${match}`;
  return (await pathExists(path.join(cwd, relative))) ? relative : undefined;
}
