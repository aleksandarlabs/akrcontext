import { lstat, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { normalizeWorkflow as normalizeConfigWorkflow, readConfig } from "./config.js";
import { listDirs, pathExists, readTextIfExists, writePlannedFile } from "./fs-utils.js";
import { type CapsuleContent, capsuleFiles } from "./harness-files.js";
import { matchesBlockedPattern, readBlockedPatterns } from "./judge-enforcement.js";
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

export interface TaskSearchResult {
  taskId: string;
  taskDir: string;
  file: string;
  line: number;
  text: string;
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

  // Typed as CapsuleContent so a new entry in capsuleFiles fails to compile until the
  // generated content for it exists here. Iterating the constant keeps the written set
  // and the set Doctor and the judge require from drifting apart.
  const content: CapsuleContent = {
    "task.md": taskMarkdown(taskId, description, selection),
    "context.md": contextMarkdown(),
    "plan.md": planMarkdown(selection.workflow),
    "acceptance-criteria.md": acceptanceMarkdown(description),
    "review-checklist.md": reviewMarkdown(),
  };
  for (const name of capsuleFiles) await write(name, content[name]);
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

/** Extract the numeric TASK-XXX id for sorting; non-matching dirs sort last. */
export function taskNumber(dir: string): number {
  const match = /^TASK-(\d+)/.exec(dir);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
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

  // Precedence: combos > game/interactive > EDD > TDD > SDD > UI > research.
  // Bug/test signals are checked before domain (api/schema) keywords because
  // a bug report about an API ("fix the api bug") is a testable defect first.
  //
  // Combined workflows — check before single-method ones.
  if (/\bsdd\b.*\bedd\b|\bedd\b.*\bsdd\b/.test(text))
    return { workflow: "SDD+EDD", reason: "matched keywords: sdd + edd" };
  if (/\bsdd\b.*\btdd\b|\btdd\b.*\bsdd\b/.test(text))
    return { workflow: "SDD+TDD", reason: "matched keywords: sdd + tdd" };
  if (/\bgame\b|\bgameplay\b|\binteractive\b/.test(text))
    return { workflow: "TDD+EDD", reason: "matched keywords: game/interactive" };

  // Single-method workflows.
  if (/\bedd\b|\bexample\b|\bedge.case\b/.test(text))
    return { workflow: "EDD", reason: "matched keywords: edd/example/edge-case" };
  if (/\btdd\b|\btest\b|\bbug\b|\bfix\b|\bregression\b/.test(text))
    return { workflow: "TDD", reason: "matched keywords: test/bug/fix/regression" };
  if (/\bsdd\b|\bapi\b|\bschema\b|\bcontract\b|\bspec\b/.test(text))
    return { workflow: "SDD", reason: "matched keywords: api/schema/contract/spec" };
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

## Validation

Commands that prove this task works. The judge must run at least one of these to
approve, and \`akrctx judge verify --run-tests\` re-runs the ones the review claims
passed. Nothing outside this list is ever executed.

\`\`\`
\`\`\`

## Out Of Scope

- Work outside this task capsule's agreed scope.

## Clarifications

Ambiguity resolved with the human before implementation. Ask only when two plausible
answers would produce different code, validation, or scope. Group answers under a
\`### Session YYYY-MM-DD\` heading, and propagate any that changes a criterion into
acceptance-criteria.md. One answer per top-level \`- \` bullet; only those are read.

- None recorded yet.

## Open Questions

Ambiguity still unresolved. Nothing here blocks mechanically, but the judge reads it:
an approval granted while one of these would have changed the implementation is an
approval against a goal nobody agreed on. Record the question; never assume the answer.
One question per top-level \`- \` bullet; only those are read.

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
  return summaries.sort((a, b) => taskNumber(a.taskId) - taskNumber(b.taskId));
}

/**
 * Find literal, case-insensitive text in the canonical files of task capsules.
 *
 * This deliberately does not use `listTasks`: search must skip links before reading,
 * apply the blocked-read policy to each candidate file, and preserve the canonical
 * `capsuleFiles` order rather than the arbitrary directory-entry order from the OS.
 */
export async function searchTaskCapsules(cwd: string, query: string): Promise<TaskSearchResult[]> {
  if (!query.trim()) throw new Error("Search query must be non-empty.");

  await rejectSymbolicLink(path.join(cwd, ".akrctx"), ".akrctx");
  const patterns = await readBlockedPatterns(cwd);
  const needle = query.toLowerCase();
  const tasksRoot = path.join(cwd, ".akrctx/tasks");
  const entries = await listRealTaskDirectories(tasksRoot);
  const matches: TaskSearchResult[] = [];

  for (const entry of entries) {
    const taskDir = path.posix.join(".akrctx/tasks", entry);
    const absoluteTaskDir = path.join(cwd, taskDir);
    // Recheck after listing so a directory replaced with a symlink is never followed.
    if (!(await isRealDirectory(absoluteTaskDir))) continue;

    for (const name of capsuleFiles) {
      const file = path.posix.join(taskDir, name);
      if (patterns.some((pattern) => matchesBlockedPattern(file, pattern))) continue;
      const content = await readRegularTextIfPresent(path.join(cwd, file), file);
      if (content === undefined) continue;

      for (const [index, text] of content.split(/\r?\n/).entries()) {
        if (!text.toLowerCase().includes(needle)) continue;
        matches.push({ taskId: parseTaskId(entry), taskDir, file, line: index + 1, text });
      }
    }
  }

  return matches;
}

async function listRealTaskDirectories(tasksRoot: string): Promise<string[]> {
  if (!(await isRealDirectory(tasksRoot))) return [];
  const entries = await readdir(tasksRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && entry.name !== "_template")
    .map((entry) => entry.name)
    .sort((left, right) => taskNumber(left) - taskNumber(right) || left.localeCompare(right));
}

async function isRealDirectory(absolutePath: string): Promise<boolean> {
  try {
    return (await lstat(absolutePath)).isDirectory();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

async function rejectSymbolicLink(absolutePath: string, relativePath: string): Promise<void> {
  const info = await lstat(absolutePath).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw new Error(`Cannot inspect ${relativePath}: ${messageOf(error)}`);
  });
  if (info?.isSymbolicLink()) throw new Error(`Cannot search task capsules through symbolic link: ${relativePath}.`);
}

async function readRegularTextIfPresent(absolutePath: string, relativePath: string): Promise<string | undefined> {
  const info = await lstat(absolutePath).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw new Error(`Cannot read task capsule file ${relativePath}: ${messageOf(error)}`);
  });
  if (!info) return undefined;
  if (info.isSymbolicLink()) return undefined;
  if (!info.isFile()) throw new Error(`Cannot read task capsule file ${relativePath}: not a regular file.`);
  try {
    return await readFile(absolutePath, "utf8");
  } catch (error) {
    throw new Error(`Cannot read task capsule file ${relativePath}: ${messageOf(error)}`);
  }
}

function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | undefined)?.code === "ENOENT";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function showTask(cwd: string, taskId: string): Promise<TaskShowResult> {
  const taskDir = await findTaskDirectory(cwd, taskId);
  if (!taskDir) {
    throw new Error(`Task not found: ${taskId}`);
  }
  const resolvedTaskId = parseTaskId(path.basename(taskDir));
  const files: Record<string, string> = {};
  for (const name of capsuleFiles) {
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
