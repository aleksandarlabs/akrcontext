import path from "node:path";
import { readConfig } from "./config.js";
import { detectTargets } from "./detect.js";
import { listDirs, pathExists } from "./fs-utils.js";
import type { CommandOptions, Target } from "./types.js";

export interface StatusResult {
  installed: boolean;
  targets: Target[];
  detectedTargets: Target[];
  taskCount: number;
  recentTaskIds: string[];
  defaultWorkflow: string;
  contextBudget: string;
}

export async function runStatus(options: CommandOptions): Promise<StatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const [config, detection, installed] = await Promise.all([
    readConfig(cwd),
    detectTargets(cwd),
    pathExists(path.join(cwd, ".akrctx/config.json")),
  ]);

  let taskCount = 0;
  let recentTaskIds: string[] = [];

  if (installed) {
    const tasksRoot = path.join(cwd, ".akrctx/tasks");
    const dirs = await listDirs(tasksRoot);
    const taskDirs = dirs.filter((d) => /^TASK-\d+/.test(d));
    taskCount = taskDirs.length;
    // Return the last 5 task IDs (e.g. "TASK-003") without the slug.
    recentTaskIds = taskDirs
      .slice(-5)
      .map((d) => {
        const match = /^(TASK-\d+)/.exec(d);
        return match ? match[1] : d;
      })
      .reverse();
  }

  return {
    installed,
    targets: config?.targets ?? [],
    detectedTargets: detection.detected,
    taskCount,
    recentTaskIds,
    defaultWorkflow: config?.defaults.workflow ?? "not configured",
    contextBudget: config?.defaults.contextBudget ?? "not configured",
  };
}
