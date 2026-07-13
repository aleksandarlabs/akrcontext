import path from "node:path";
import { readConfigStrict, writeConfig } from "./config.js";
import { pathExists, readTextIfExists } from "./fs-utils.js";
import type { CommandOptions, akrctxConfig } from "./types.js";
import { CLI_VERSION } from "./version.js";

export const localIgnorePath = ".akrctx/local/.gitignore";

export interface ComprehensionStatusResult {
  enabled: boolean;
  trigger: "agent-assessed-significance";
  evaluationMode: "prefer-independent";
  localIgnoreValid: boolean;
  localIgnorePath: string;
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

export async function runComprehensionEnable(options: CommandOptions): Promise<ComprehensionStatusResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfigStrict(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  if (config.installedVersion !== CLI_VERSION) {
    throw new Error("Harness is not current. Run `akrctx upgrade` before enabling comprehension checkpoints.");
  }
  if (!(await pathExists(path.join(cwd, ".akrctx/comprehension/schemas/result.schema.json")))) {
    throw new Error("Comprehension contract files are missing. Run `akrctx doctor --fix` first.");
  }
  if (!(await hasValidLocalIgnore(cwd))) {
    throw new Error("Local comprehension storage is not safely ignored. Run `akrctx doctor --fix` first.");
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
  return buildStatus(cwd, next);
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
  return {
    enabled: config.comprehensionGate.enabled,
    trigger: config.comprehensionGate.trigger,
    evaluationMode: config.comprehensionGate.evaluationMode,
    localIgnoreValid: await hasValidLocalIgnore(cwd),
    localIgnorePath,
  };
}
