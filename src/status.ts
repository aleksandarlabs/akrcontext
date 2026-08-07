import path from "node:path";
import { agentWarningTexts, resolveAgent, resolveAgents } from "./agents.js";
import { readConfig } from "./config.js";
import { detectTargets } from "./detect.js";
import { listDirs, pathExists } from "./fs-utils.js";
import { taskNumber } from "./task.js";
import type { AgentName, CommandOptions, Target } from "./types.js";

export interface StatusResult {
  installed: boolean;
  targets: Target[];
  detectedTargets: Target[];
  taskCount: number;
  recentTaskIds: string[];
  defaultWorkflow: string;
  contextBudget: string;
  comprehensionGate: "enabled" | "disabled";
  agents: Array<{ name: AgentName; enabled: boolean; trigger: string; targets: Target[] }>;
  warnings: string[];
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
    // Return the 5 most recent task IDs (e.g. "TASK-003") without the slug,
    // sorted numerically (descending) rather than relying on readdir order.
    recentTaskIds = taskDirs
      .slice()
      .sort((a, b) => taskNumber(b) - taskNumber(a))
      .slice(0, 5)
      .map((d) => {
        const match = /^(TASK-\d+)/.exec(d);
        return match ? match[1] : d;
      });
  }

  return {
    installed,
    targets: config?.targets ?? [],
    detectedTargets: detection.detected,
    taskCount,
    recentTaskIds,
    defaultWorkflow: config?.defaults.workflow ?? "not configured",
    contextBudget: config?.defaults.contextBudget ?? "not configured",
    comprehensionGate: config && resolveAgent(config, "comprehension").enabled ? "enabled" : "disabled",
    agents: config
      ? Object.values(resolveAgents(config)).map((agent) => ({
          name: agent.name,
          enabled: agent.enabled,
          trigger: agent.trigger,
          targets: agent.targets,
        }))
      : [],
    warnings: config ? agentWarningTexts(config) : [],
  };
}
