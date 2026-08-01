import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { isLocalIgnoreContentSafe, localIgnorePath } from "./comprehension.js";
import { readConfig, writeConfig } from "./config.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import { createManifestFromWrites } from "./manifest.js";
import { claudeJudgeFile, codexJudgeFile, copilotJudgeFile } from "./templates.js";
import { JUDGE_SCHEMA_ID } from "./templates/judge-contract.js";
import type { CommandOptions, Target, WriteResult } from "./types.js";
import { CLI_VERSION } from "./version.js";

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
  await requireJudgeContract(cwd);

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
    writes.push(await createManifestFromWrites(cwd, writes, CLI_VERSION));
  }

  return { dryRun: Boolean(options.dryRun), installedTargets, skippedTargets, writes };
}

async function requireJudgeContract(cwd: string): Promise<void> {
  const schemaPath = path.join(cwd, ".akrctx/judge/schemas/review.schema.json");
  try {
    const schema = JSON.parse(await readFile(schemaPath, "utf8"));
    if (schema.$id !== JUDGE_SCHEMA_ID || schema.$schema !== "https://json-schema.org/draft/2020-12/schema") {
      throw new Error("wrong schema identity");
    }
  } catch {
    throw new Error("Judge enforcement contract is missing or invalid. Run `akrctx upgrade` first.");
  }
  const ignore = await readFile(path.join(cwd, localIgnorePath), "utf8").catch(() => "");
  if (!isLocalIgnoreContentSafe(ignore)) {
    throw new Error("Local judge storage is not safely ignored. Run `akrctx doctor --fix` first.");
  }
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

  const checked = await Promise.all(allFiles.map(async (f) => ({ f, exists: await pathExists(path.join(cwd, f)) })));
  const presentFiles = checked.filter((r) => r.exists).map((r) => r.f);
  const missingFiles = checked.filter((r) => !r.exists).map((r) => r.f);

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
