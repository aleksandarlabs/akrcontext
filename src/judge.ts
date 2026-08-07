import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { agentFilePathList, agentFiles, agentWarnings, resolveAgent, withAgentSetting } from "./agents.js";
import { isLocalIgnoreContentSafe, localIgnorePath } from "./comprehension.js";
import { readConfig, writeConfig } from "./config.js";
import { pathExists, writePlannedFile } from "./fs-utils.js";
import { createManifestFromWrites } from "./manifest.js";
import { JUDGE_SCHEMA_ID } from "./templates/judge-contract.js";
import type { CommandOptions, Target, WriteResult } from "./types.js";
import { CLI_VERSION } from "./version.js";

export interface JudgeEnableResult {
  dryRun: boolean;
  installedTargets: Target[];
  skippedTargets: Target[];
  writes: WriteResult[];
  models: Array<{ target: Target; model?: string; configPath: string }>;
  warnings: string[];
}

export interface JudgeStatusResult {
  enabled: boolean;
  trigger: string;
  installedTargets: Target[];
  presentFiles: string[];
  missingFiles: string[];
  models: Array<{ target: Target; model?: string; configPath: string }>;
  warnings: string[];
}

export async function runJudgeEnable(options: CommandOptions): Promise<JudgeEnableResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  await requireJudgeContract(cwd);

  const resolved = resolveAgent(config, "judge");
  const installedTargets = resolved.targets;
  const skippedTargets = config.targets.filter((target) => !(installedTargets as Target[]).includes(target));
  if (installedTargets.length === 0) {
    throw new Error("No installed target has a judge agent format.");
  }

  const writes: WriteResult[] = [];
  for (const target of installedTargets) {
    for (const [relativePath, content] of Object.entries(agentFiles("judge", target, resolved.model[target]))) {
      writes.push(
        await writePlannedFile(cwd, relativePath, content, {
          dryRun: options.dryRun,
          force: true,
          reason: `akrctx judge agent file for ${target}.`,
        }),
      );
    }
  }

  const next = withAgentSetting(config, "judge", { enabled: true, trigger: resolved.trigger });
  if (!options.dryRun) {
    await writeConfig(cwd, next);
    writes.push(await createManifestFromWrites(cwd, writes, CLI_VERSION));
  }

  return {
    dryRun: Boolean(options.dryRun),
    installedTargets,
    skippedTargets,
    writes,
    models: installedTargets.map((target) => ({
      target,
      model: resolved.model[target],
      configPath: `agents.judge.model.${target}`,
    })),
    warnings: judgeWarnings(next),
  };
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
    await writeConfig(cwd, withAgentSetting(config, "judge", { enabled: false }));
  }

  return { dryRun: Boolean(options.dryRun) };
}

export async function runJudgeStatus(options: CommandOptions): Promise<JudgeStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");

  const resolved = resolveAgent(config, "judge");
  const allFiles = agentFilePathList("judge", resolved.targets);

  const checked = await Promise.all(allFiles.map(async (f) => ({ f, exists: await pathExists(path.join(cwd, f)) })));

  return {
    enabled: resolved.enabled,
    trigger: resolved.trigger,
    installedTargets: resolved.targets,
    presentFiles: checked.filter((r) => r.exists).map((r) => r.f),
    missingFiles: checked.filter((r) => !r.exists).map((r) => r.f),
    models: resolved.targets.map((target) => ({
      target,
      model: resolved.model[target],
      configPath: `agents.judge.model.${target}`,
    })),
    warnings: judgeWarnings(config),
  };
}

function judgeWarnings(config: import("./types.js").akrctxConfig): string[] {
  return agentWarnings(config)
    .filter((warning) => warning.agent === "judge")
    .map((warning) => warning.text);
}

export async function removeJudgeFiles(cwd: string, targets: Target[]): Promise<string[]> {
  const removed: string[] = [];
  for (const relativePath of agentFilePathList("judge", targets)) {
    const absolute = path.join(cwd, relativePath);
    if (await pathExists(absolute)) {
      await rm(absolute);
      removed.push(relativePath);
    }
  }
  return removed;
}
