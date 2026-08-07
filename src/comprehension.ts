import path from "node:path";
import { agentFilePathList, agentFiles, agentWarnings, resolveAgent, withAgentSetting } from "./agents.js";
import { readConfig, writeConfig } from "./config.js";
import { pathExists, readTextIfExists, writePlannedFile } from "./fs-utils.js";
import { createManifestFromWrites } from "./manifest.js";
import type { CommandOptions, Target, WriteResult, akrctxConfig } from "./types.js";
import { CLI_VERSION } from "./version.js";

export const localIgnorePath = ".akrctx/local/.gitignore";

const contractFiles = [
  [".akrctx/comprehension/schemas/scope.schema.json", "akrctx-comprehension-scope-v1"],
  [".akrctx/comprehension/schemas/rubric.schema.json", "akrctx-comprehension-rubric-v1"],
  [".akrctx/comprehension/schemas/result.schema.json", "akrctx-comprehension-result-v1"],
] as const;

export interface ComprehensionStatusResult {
  enabled: boolean;
  trigger: string;
  evaluationMode: "prefer-independent";
  localIgnoreValid: boolean;
  localIgnorePath: string;
  installedTargets: Target[];
  skippedTargets: Target[];
  presentFiles: string[];
  missingFiles: string[];
  models: Array<{ target: Target; model?: string; configPath: string }>;
  warnings: string[];
}

export interface ComprehensionEnableResult extends ComprehensionStatusResult {
  dryRun: boolean;
  writes: WriteResult[];
}

export function isLocalIgnoreContentSafe(content: string | undefined): boolean {
  if (content === undefined) return false;
  const rules = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  return rules.length === 2 && rules[0] === "*" && rules[1] === "!.gitignore";
}

export async function hasValidLocalIgnore(cwd: string): Promise<boolean> {
  return isLocalIgnoreContentSafe(await readTextIfExists(path.join(cwd, localIgnorePath)));
}

export async function runComprehensionEnable(options: CommandOptions): Promise<ComprehensionEnableResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  if (config.installedVersion !== CLI_VERSION) {
    throw new Error("Harness is not current. Run `akrctx upgrade` before enabling comprehension checkpoints.");
  }
  if (!(await hasValidComprehensionContract(cwd))) {
    throw new Error("Comprehension contract files are missing or invalid. Run `akrctx doctor --fix` first.");
  }
  if (!(await hasValidLocalIgnore(cwd))) {
    throw new Error("Local comprehension storage is not safely ignored. Run `akrctx doctor --fix` first.");
  }
  const resolved = resolveAgent(config, "comprehension");
  const installedTargets = resolved.targets;
  const skippedTargets = config.targets.filter((target) => !(installedTargets as Target[]).includes(target));
  if (installedTargets.length === 0) {
    throw new Error("No installed target supports an independent comprehension agent.");
  }
  const writes: WriteResult[] = [];
  for (const target of installedTargets) {
    for (const [relativePath, content] of Object.entries(agentFiles("comprehension", target, resolved.model[target]))) {
      writes.push(
        await writePlannedFile(cwd, relativePath, content, {
          dryRun: options.dryRun,
          // Regenerated from configuration, the same way `akrctx upgrade` rewrites it.
          force: true,
          reason: `akrctx comprehension agent file for ${target}.`,
        }),
      );
    }
  }
  const next = withAgentSetting(config, "comprehension", { enabled: true, trigger: resolved.trigger });
  if (!options.dryRun) {
    await writeConfig(cwd, next);
    writes.push(await createManifestFromWrites(cwd, writes, CLI_VERSION));
  }
  return {
    ...(await buildStatus(cwd, next)),
    dryRun: Boolean(options.dryRun),
    writes,
    installedTargets,
    skippedTargets,
  };
}

export async function runComprehensionDisable(options: CommandOptions): Promise<ComprehensionStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  const next = withAgentSetting(config, "comprehension", { enabled: false });
  if (!options.dryRun) await writeConfig(cwd, next);
  return buildStatus(cwd, next);
}

export async function runComprehensionStatus(options: CommandOptions): Promise<ComprehensionStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  return buildStatus(cwd, config);
}

async function buildStatus(cwd: string, config: akrctxConfig): Promise<ComprehensionStatusResult> {
  const resolved = resolveAgent(config, "comprehension");
  const installedTargets = resolved.targets;
  const skippedTargets = config.targets.filter((target) => !(installedTargets as Target[]).includes(target));
  const expectedFiles = agentFilePathList("comprehension", installedTargets);
  const checked = await Promise.all(
    expectedFiles.map(async (file) => ({ file, exists: await pathExists(path.join(cwd, file)) })),
  );
  return {
    enabled: resolved.enabled,
    trigger: resolved.trigger,
    evaluationMode: config.comprehensionGate.evaluationMode,
    localIgnoreValid: await hasValidLocalIgnore(cwd),
    localIgnorePath,
    installedTargets,
    skippedTargets,
    presentFiles: checked.filter((entry) => entry.exists).map((entry) => entry.file),
    missingFiles: checked.filter((entry) => !entry.exists).map((entry) => entry.file),
    models: installedTargets.map((target) => ({
      target,
      model: resolved.model[target],
      configPath: `agents.comprehension.model.${target}`,
    })),
    warnings: agentWarnings(config)
      .filter((warning) => warning.agent === "comprehension")
      .map((warning) => warning.text),
  };
}

async function hasValidComprehensionContract(cwd: string): Promise<boolean> {
  for (const [relativePath, expectedId] of contractFiles) {
    const content = await readTextIfExists(path.join(cwd, relativePath));
    if (!content) return false;
    try {
      const schema = JSON.parse(content);
      if (schema?.$id !== expectedId || schema?.$schema !== "https://json-schema.org/draft/2020-12/schema")
        return false;
    } catch {
      return false;
    }
  }
  return true;
}
