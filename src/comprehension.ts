import path from "node:path";
import { readConfigStrict, writeConfig } from "./config.js";
import { pathExists, readTextIfExists, writePlannedFile } from "./fs-utils.js";
import {
  claudeComprehensionAgentFile,
  codexComprehensionAgentFile,
  copilotComprehensionAgentFile,
} from "./templates.js";
import type { CommandOptions, Target, WriteResult, akrctxConfig } from "./types.js";
import { CLI_VERSION } from "./version.js";

export const localIgnorePath = ".akrctx/local/.gitignore";

type ComprehensionAgentTarget = Exclude<Target, "pi">;

export const comprehensionAgentFilesByTarget: Record<ComprehensionAgentTarget, Record<string, string>> = {
  claude: claudeComprehensionAgentFile,
  copilot: copilotComprehensionAgentFile,
  codex: codexComprehensionAgentFile,
};

const contractFiles = [
  [".akrctx/comprehension/schemas/scope.schema.json", "akrctx-comprehension-scope-v1"],
  [".akrctx/comprehension/schemas/rubric.schema.json", "akrctx-comprehension-rubric-v1"],
  [".akrctx/comprehension/schemas/result.schema.json", "akrctx-comprehension-result-v1"],
] as const;

function hasComprehensionAgent(target: Target): target is ComprehensionAgentTarget {
  return target in comprehensionAgentFilesByTarget;
}

export interface ComprehensionStatusResult {
  enabled: boolean;
  trigger: "agent-assessed-significance";
  evaluationMode: "prefer-independent";
  localIgnoreValid: boolean;
  localIgnorePath: string;
  installedTargets: Target[];
  skippedTargets: Target[];
  presentFiles: string[];
  missingFiles: string[];
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
  const config = await readConfigStrict(cwd);
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
  const installedTargets = config.targets.filter(hasComprehensionAgent);
  const skippedTargets = config.targets.filter((target) => !hasComprehensionAgent(target));
  if (installedTargets.length === 0) {
    throw new Error("No installed target supports an independent comprehension agent.");
  }
  const writes: WriteResult[] = [];
  for (const target of installedTargets) {
    for (const [relativePath, content] of Object.entries(comprehensionAgentFilesByTarget[target])) {
      writes.push(
        await writePlannedFile(cwd, relativePath, content, {
          dryRun: options.dryRun,
          force: options.force,
          reason: `akrctx comprehension agent file for ${target}.`,
        }),
      );
    }
  }
  const next = {
    ...config,
    comprehensionGate: {
      enabled: true,
      trigger: "agent-assessed-significance" as const,
      evaluationMode: "prefer-independent" as const,
    },
  };
  if (!options.dryRun) {
    await writeConfig(cwd, next);
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
  const config = await readConfigStrict(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  const next = { ...config, comprehensionGate: { ...config.comprehensionGate, enabled: false } };
  if (!options.dryRun) await writeConfig(cwd, next);
  return buildStatus(cwd, next);
}

export async function runComprehensionStatus(options: CommandOptions): Promise<ComprehensionStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfigStrict(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  return buildStatus(cwd, config);
}

async function buildStatus(cwd: string, config: akrctxConfig): Promise<ComprehensionStatusResult> {
  const installedTargets = config.targets.filter(hasComprehensionAgent);
  const skippedTargets = config.targets.filter((target) => !hasComprehensionAgent(target));
  const expectedFiles = installedTargets.flatMap((target) => Object.keys(comprehensionAgentFilesByTarget[target]));
  const checked = await Promise.all(
    expectedFiles.map(async (file) => ({ file, exists: await pathExists(path.join(cwd, file)) })),
  );
  return {
    enabled: config.comprehensionGate.enabled,
    trigger: config.comprehensionGate.trigger,
    evaluationMode: config.comprehensionGate.evaluationMode,
    localIgnoreValid: await hasValidLocalIgnore(cwd),
    localIgnorePath,
    installedTargets,
    skippedTargets,
    presentFiles: checked.filter((entry) => entry.exists).map((entry) => entry.file),
    missingFiles: checked.filter((entry) => !entry.exists).map((entry) => entry.file),
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
