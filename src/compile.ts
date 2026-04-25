import path from "node:path";
import { readTextIfExists, writePlannedFile } from "./fs-utils.js";
import { findTaskDirectory } from "./task.js";
import type { CommandOptions, Target } from "./types.js";

export interface CompileResult {
  taskId: string;
  target: Target;
  outputPath: string;
}

export async function runCompile(taskId: string, options: CommandOptions & { target?: Target }): Promise<CompileResult> {
  const cwd = options.cwd ?? process.cwd();
  const target = options.target ?? "codex";
  const taskDir = await findTaskDirectory(cwd, taskId);
  if (!taskDir) {
    throw new Error(`Task not found: ${taskId}`);
  }

  const task = (await readTextIfExists(path.join(cwd, taskDir, "task.md"))) ?? "";
  const context = (await readTextIfExists(path.join(cwd, taskDir, "context.md"))) ?? "";
  const plan = (await readTextIfExists(path.join(cwd, taskDir, "plan.md"))) ?? "";
  const acceptance = (await readTextIfExists(path.join(cwd, taskDir, "acceptance-criteria.md"))) ?? "";
  const checklist = (await readTextIfExists(path.join(cwd, taskDir, "review-checklist.md"))) ?? "";
  const outputPath = path.posix.join(taskDir, "exports", `${target}.md`);

  const brief = `# akrctx ${target} Brief - ${taskId}

Use this brief with the ${target} target adapter. Do not read secrets or overwrite existing instruction files without explicit human approval.

## Task

${task.trim()}

## Context

${context.trim()}

## Plan

${plan.trim()}

## Acceptance Criteria

${acceptance.trim()}

## Review Checklist

${checklist.trim()}
`;

  await writePlannedFile(cwd, outputPath, brief, {
    dryRun: options.dryRun,
    force: options.force,
    reason: "Compiled target-specific akrctx brief.",
  });

  return { taskId, target, outputPath };
}
