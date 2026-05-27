import { rm } from "node:fs/promises";
import path from "node:path";
import { readConfig, writeConfig } from "./config.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import { claudeJudgeFile, codexJudgeFile, copilotJudgeFile } from "./templates.js";
import type { CommandOptions, Target, WriteResult } from "./types.js";

type JudgeTarget = Exclude<Target, "pi">;

const judgeFilesByTarget: Record<JudgeTarget, Record<string, string>> = {
  claude: claudeJudgeFile,
  copilot: copilotJudgeFile,
  codex: codexJudgeFile,
};

function hasJudgeFiles(target: Target): target is JudgeTarget {
  return target in judgeFilesByTarget;
}

export interface JudgeEnableResult {
  dryRun: boolean;
  installedTargets: Target[];
  skippedTargets: Target[];
  writes: WriteResult[];
}

export interface JudgeStatusResult {
  enabled: boolean;
  trigger: string;
  installedTargets: Target[];
  presentFiles: string[];
  missingFiles: string[];
}

export async function runJudgeEnable(options: CommandOptions): Promise<JudgeEnableResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");

  const installedTargets = config.targets.filter(hasJudgeFiles);
  const skippedTargets = config.targets.filter((t) => !hasJudgeFiles(t));

  const writes: WriteResult[] = [];
  for (const target of installedTargets) {
    const files = judgeFilesByTarget[target];
    for (const [relativePath, content] of Object.entries(files)) {
      writes.push(
        await writePlannedFile(cwd, relativePath, content, {
          dryRun: options.dryRun,
          force: options.force,
          reason: `akrctx judge agent file for ${target}.`,
        }),
      );
    }
  }

  if (!options.dryRun) {
    const next = { ...config, judge: { enabled: true, trigger: "post-implementation" as const } };
    await writeConfig(cwd, next);
  }

  return { dryRun: Boolean(options.dryRun), installedTargets, skippedTargets, writes };
}

export async function runJudgeDisable(options: CommandOptions): Promise<{ dryRun: boolean }> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");

  if (!options.dryRun) {
    const next = { ...config, judge: { enabled: false, trigger: "post-implementation" as const } };
    await writeConfig(cwd, next);
  }

  return { dryRun: Boolean(options.dryRun) };
}

export async function runJudgeStatus(options: CommandOptions): Promise<JudgeStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");

  const installedTargets = config.targets.filter(hasJudgeFiles);
  const allFiles = installedTargets.flatMap((t) => Object.keys(judgeFilesByTarget[t]));

  const [presentFiles, missingFiles] = await Promise.all([
    Promise.all(allFiles.map(async (f) => ({ f, exists: await pathExists(path.join(cwd, f)) }))).then((results) =>
      results.filter((r) => r.exists).map((r) => r.f),
    ),
    Promise.all(allFiles.map(async (f) => ({ f, exists: await pathExists(path.join(cwd, f)) }))).then((results) =>
      results.filter((r) => !r.exists).map((r) => r.f),
    ),
  ]);

  return {
    enabled: config.judge?.enabled ?? false,
    trigger: config.judge?.trigger ?? "post-implementation",
    installedTargets,
    presentFiles,
    missingFiles,
  };
}

export async function removeJudgeFiles(cwd: string, targets: Target[]): Promise<string[]> {
  const removed: string[] = [];
  for (const target of targets) {
    if (!hasJudgeFiles(target)) continue;
    const files = judgeFilesByTarget[target];
    for (const relativePath of Object.keys(files)) {
      const absolute = path.join(cwd, relativePath);
      if (await pathExists(absolute)) {
        await rm(absolute);
        removed.push(relativePath);
      }
    }
  }
  return removed;
}
