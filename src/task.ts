import { rm } from "node:fs/promises";
import path from "node:path";
import { normalizeWorkflow as normalizeConfigWorkflow, readConfig } from "./config.js";
import { listDirs, pathExists, readTextIfExists, writePlannedFile } from "./fs-utils.js";
import type { CommandOptions, TaskWorkflow, Workflow, akrctxConfig } from "./types.js";
import { workflows } from "./types.js";

export interface TaskResult {
  taskId: string;
  taskDir: string;
  workflow: TaskWorkflow;
  workflowReason: string;
  writes: string[];
}

export interface TaskSummary {
  taskId: string;
  taskDir: string;
  description: string;
}

export interface TaskShowResult {
  taskId: string;
  taskDir: string;
  workflow?: string;
  files: Record<string, string>;
}

export interface TaskRemoveResult {
  taskId: string;
  taskDir: string;
  removed: boolean;
}

export interface WorkflowSelection {
  workflow: TaskWorkflow;
  reason: string;
}

export async function runTask(description: string, options: CommandOptions): Promise<TaskResult> {
  const cwd = options.cwd ?? process.cwd();
  const tasksRoot = path.join(cwd, ".akrctx/tasks");
  const taskId = await nextTaskId(tasksRoot, description);
  const slug = slugify(description);
  const taskDir = `.akrctx/tasks/${taskId}-${slug}`;
  const config = await readConfig(cwd);
  const selection = selectWorkflow(description, options.workflow, config);
  const writes: string[] = [];

  const write = async (relative: string, content: string) => {
    const result = await writePlannedFile(cwd, path.posix.join(taskDir, relative), content, {
      dryRun: options.dryRun,
      force: options.force,
      reason: "akrctx task capsule file.",
    });
    writes.push(result.path);
  };

  await write("task.md", taskMarkdown(taskId, description, selection));
  await write("context.md", contextMarkdown());
  await write("plan.md", planMarkdown(selection.workflow));
  await write("acceptance-criteria.md", acceptanceMarkdown(description));
  await write("review-checklist.md", reviewMarkdown());
  await write(
    "exports/README.md",
    "# Exports\n\nRun `akrctx compile <taskId> --target <target>` to create agent-specific briefs.\n",
  );

  return { taskId, taskDir, workflow: selection.workflow, workflowReason: selection.reason, writes };
}

async function nextTaskId(tasksRoot: string, _description: string): Promise<string> {
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

/**
 * Recommend a workflow based on keywords in the description.
 *
 * Each keyword is wrapped in \b word boundaries so partial matches inside
 * longer words (e.g. "api" in "capitalism") do not trigger false positives.
 */
export function recommendWorkflow(description: string): WorkflowSelection {
  const text = description.toLowerCase();

  // Combined workflows — check before single-method ones.
  if (/\bsdd\b.*\bedd\b|\bedd\b.*\bsdd\b/.test(text))
    return { workflow: "SDD+EDD", reason: "matched keywords: sdd + edd" };
  if (/\bsdd\b.*\btdd\b|\btdd\b.*\bsdd\b/.test(text))
    return { workflow: "SDD+TDD", reason: "matched keywords: sdd + tdd" };
  if (/\btetris\b|\bgame\b|\bgameplay\b|\binteractive\b/.test(text))
    return { workflow: "TDD+EDD", reason: "matched keywords: game/interactive" };

  // Single-method workflows.
  if (/\bedd\b|\bexample\b|\bedge.case\b/.test(text))
    return { workflow: "EDD", reason: "matched keywords: edd/example/edge-case" };
  if (/\bsdd\b|\bapi\b|\bschema\b|\bcontract\b|\bspec\b/.test(text))
    return { workflow: "SDD", reason: "matched keywords: api/schema/contract/spec" };
  if (/\btdd\b|\btest\b|\bbug\b|\bfix\b|\bregression\b/.test(text))
    return { workflow: "TDD", reason: "matched keywords: test/bug/fix/regression" };
  if (/\bui\b|\bscreen\b|\bpage\b|\bcomponent\b|\bdesign\b|\btabs\b/.test(text))
    return { workflow: "UI review", reason: "matched keywords: ui/screen/page/component" };
  if (/\bresearch\b|\binvestigate\b|\bunknown\b|\bspike\b/.test(text))
    return { workflow: "research-first", reason: "matched keywords: research/investigate/spike" };

  return { workflow: "fast-patch", reason: "no specific keywords matched" };
}

export function normalizeWorkflow(workflow: string | undefined): Workflow | undefined {
  const resolved = normalizeConfigWorkflow(workflow);
  if (workflow && !resolved) {
    throw new Error(
      `Unsupported workflow: "${workflow}". Valid values: fast-patch, research-first, SDD, TDD, EDD, SDD+TDD, SDD+EDD, TDD+EDD.`,
    );
  }
  return resolved;
}

function selectWorkflow(
  description: string,
  explicitWorkflow: string | undefined,
  config: akrctxConfig | undefined,
): WorkflowSelection {
  const allowed = config?.defaults.allowedWorkflows ?? [...workflows];

  const explicit = normalizeWorkflow(explicitWorkflow);
  if (explicit) {
    assertWorkflowAllowed(explicit, allowed);
    return { workflow: explicit, reason: "explicit CLI override" };
  }

  if (config?.defaults.workflow && config.defaults.workflow !== "task-fit") {
    assertWorkflowAllowed(config.defaults.workflow, allowed);
    return { workflow: config.defaults.workflow, reason: "project default" };
  }

  const recommended = recommendWorkflow(description);
  // "UI review" is a task-level recommendation, not a selectable config default
  // (see types.ts TaskWorkflow), so allowedWorkflows never filters it out.
  if (recommended.workflow === "UI review") {
    return recommended;
  }
  if (isWorkflowAllowed(recommended.workflow, allowed)) {
    return recommended;
  }

  const fallback = allowed[0];
  return {
    workflow: fallback,
    reason: `${recommended.reason} (not in allowedWorkflows; fell back to ${fallback})`,
  };
}

function isWorkflowAllowed(workflow: TaskWorkflow, allowed: Workflow[]): boolean {
  return allowed.includes(workflow as Workflow);
}

function assertWorkflowAllowed(workflow: Workflow, allowed: Workflow[]): void {
  if (!allowed.includes(workflow)) {
    throw new Error(`Workflow "${workflow}" is not in allowedWorkflows. Allowed values: ${allowed.join(", ")}.`);
  }
}

function taskMarkdown(taskId: string, description: string, selection: WorkflowSelection): string {
  return `# ${taskId}

## Goal

${description}

## Recommended Workflow

${selection.workflow}

## Workflow Notes

- Workflow source: ${selection.reason}.
- Why this workflow: fill this in before implementation if the reason is not obvious.
- Keep context loading proportional. Do not read all of .akrctx/ unless the task requires it.

## Out Of Scope

- Work outside this task capsule's agreed scope.

## Open Questions

- None recorded yet.
`;
}

function contextMarkdown(): string {
  return `# Context

## Relevant Files To Inspect

- README.md
- package.json
- .akrctx/wiki/
- .akrctx/policy.json
- .akrctx/wiki/write-policy.md

## Blocked Reads

- .env
- .env.*
- *.pem
- *.key
- *.p12
- *.pfx
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

1. Read this task capsule and .akrctx/policy.json.
2. Load only the workflow skill or prompt matching ${workflow}.
3. Inspect only files needed for the task.
4. Confirm acceptance criteria and validation commands.
5. Implement within scope.
6. Run quality gates.
7. Review for instruction overwrite, secret handling, and scope boundaries.
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
  const tasksRoot = path.join(cwd, ".akrctx/tasks");
  const dirs = await listDirs(tasksRoot);
  const match = dirs.find((dir) => dir === taskId || dir.startsWith(`${taskId}-`));
  if (!match) return undefined;
  const relative = `.akrctx/tasks/${match}`;
  return (await pathExists(path.join(cwd, relative))) ? relative : undefined;
}

function parseTaskId(taskDir: string): string {
  const match = /^TASK-(\d+)/.exec(taskDir);
  return match ? `TASK-${match[1]}` : taskDir;
}

function parseDescription(taskMarkdown: string): string {
  const match = /## Goal\n\n(.+)/.exec(taskMarkdown);
  return match ? match[1].trim() : "";
}

export async function listTasks(cwd: string): Promise<TaskSummary[]> {
  const tasksRoot = path.join(cwd, ".akrctx/tasks");
  if (!(await pathExists(tasksRoot))) return [];
  const dirs = await listDirs(tasksRoot);
  const summaries: TaskSummary[] = [];
  for (const dir of dirs) {
    if (dir === "_template") continue;
    const taskDir = `.akrctx/tasks/${dir}`;
    const taskMd = await readTextIfExists(path.join(cwd, taskDir, "task.md"));
    summaries.push({
      taskId: parseTaskId(dir),
      taskDir,
      description: taskMd ? parseDescription(taskMd) : "",
    });
  }
  return summaries.sort((a, b) => a.taskId.localeCompare(b.taskId));
}

export async function showTask(cwd: string, taskId: string): Promise<TaskShowResult> {
  const taskDir = await findTaskDirectory(cwd, taskId);
  if (!taskDir) {
    throw new Error(`Task not found: ${taskId}`);
  }
  const resolvedTaskId = parseTaskId(path.basename(taskDir));
  const files: Record<string, string> = {};
  const fileNames = ["task.md", "context.md", "plan.md", "acceptance-criteria.md", "review-checklist.md"];
  for (const name of fileNames) {
    const content = await readTextIfExists(path.join(cwd, taskDir, name));
    if (content !== undefined) files[name] = content;
  }
  const taskMd = files["task.md"] ?? "";
  const workflowMatch = /## Recommended Workflow\n\n(.+)/.exec(taskMd);
  return {
    taskId: resolvedTaskId,
    taskDir,
    workflow: workflowMatch ? workflowMatch[1].trim() : undefined,
    files,
  };
}

export async function removeTask(cwd: string, taskId: string, options: CommandOptions): Promise<TaskRemoveResult> {
  const taskDir = await findTaskDirectory(cwd, taskId);
  if (!taskDir) {
    throw new Error(`Task not found: ${taskId}`);
  }
  if (options.dryRun) {
    return { taskId, taskDir, removed: false };
  }
  await rm(path.join(cwd, taskDir), { recursive: true, force: true });
  return { taskId, taskDir, removed: true };
}
