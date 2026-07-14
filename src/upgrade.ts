import { readFile } from "node:fs/promises";
import path from "node:path";
import { readConfigStrict } from "./config.js";
import { ensureTrailingNewline, pathExists, writePlannedFile } from "./fs-utils.js";
import {
  type akrctxManifest,
  contentHash,
  isManifestManagedPath,
  readManifest,
  templateHash,
  writeManifest,
} from "./manifest.js";
import { mergeTemplateJson } from "./template-pack.js";
import {
  claudeCommands,
  claudeComprehensionAgentFile,
  claudeJudgeFile,
  claudeSkills,
  codexComprehensionAgentFile,
  codexJudgeFile,
  codexSkills,
  comprehensionFiles,
  copilotComprehensionAgentFile,
  copilotFiles,
  copilotJudgeFile,
  copilotSkills,
  defaultPolicy,
  judgeContractFiles,
  localComprehensionIgnoreTemplate,
  mainInstructionTemplate,
  overviewTemplate,
  piFiles,
  piSkills,
  targetReferenceTemplates,
  taskTemplateFiles,
  wikiTemplates,
} from "./templates.js";
import type { CommandOptions, Target, WriteResult, akrctxConfig, akrctxPolicy } from "./types.js";
import { CLI_VERSION } from "./version.js";

export interface UpgradeResult {
  dryRun: boolean;
  fromVersion?: string;
  toVersion: string;
  selectedTargets: Target[];
  writes: WriteResult[];
  conflicts: string[];
  obsolete: string[];
  completed: boolean;
  installationComplete: boolean;
}

const comprehensionAgents = {
  codex: codexComprehensionAgentFile,
  claude: claudeComprehensionAgentFile,
  copilot: copilotComprehensionAgentFile,
};

const judgeAgents = {
  codex: codexJudgeFile,
  claude: claudeJudgeFile,
  copilot: copilotJudgeFile,
};

export async function runUpgrade(options: CommandOptions): Promise<UpgradeResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfigStrict(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  const selectedTargets = resolveUpgradeTargets(config, options.target);
  const manifestExists = await pathExists(path.join(cwd, ".akrctx/manifest.json"));
  const previousManifest = await readManifest(cwd);
  const invalidManifest = manifestExists && !previousManifest;
  const nextManifest: akrctxManifest = {
    schemaVersion: 1,
    cliVersion: CLI_VERSION,
    files: { ...(previousManifest?.files ?? {}) },
  };
  const writes: WriteResult[] = [];
  const conflicts: string[] = [];

  const desired = desiredManagedFiles(config, selectedTargets);
  for (const [relativePath, content] of Object.entries(desired)) {
    const result = await upgradeManagedFile(cwd, relativePath, content, previousManifest, options);
    writes.push(...result.writes);
    if (result.conflict) conflicts.push(relativePath);
    if (result.appliedHash) nextManifest.files[relativePath] = { hash: result.appliedHash };
  }

  for (const target of selectedTargets) {
    const root = rootInstruction(target);
    if (!root) continue;
    writes.push(...(await preserveRootInstruction(cwd, root.path, root.content, options)));
  }

  writes.push(...(await preserveProjectKnowledge(cwd, config, options)));
  const policyMigration = await migratePolicy(cwd, config, options);
  writes.push(...policyMigration.writes);
  if (policyMigration.conflict) conflicts.push(".akrctx/policy.json");

  const allDesiredPaths = new Set(Object.keys(desiredManagedFiles(config, config.targets)));
  const obsolete = Object.keys(previousManifest?.files ?? {}).filter(
    (relativePath) => isManifestManagedPath(relativePath) && !allDesiredPaths.has(relativePath),
  );
  for (const relativePath of obsolete) {
    if (await pathExists(path.join(cwd, relativePath))) {
      writes.push({
        kind: "preserve",
        path: relativePath,
        reason: "No longer generated; preserved for manual review.",
      });
    }
  }
  if (invalidManifest) {
    const relativePath = ".akrctx/manifest.json";
    const suggestionPath = path.posix.join(".akrctx", "upgrades", CLI_VERSION, relativePath);
    await writePlannedFile(cwd, suggestionPath, `${JSON.stringify(nextManifest, null, 2)}\n`, {
      dryRun: options.dryRun,
      reason: "Replacement provenance manifest candidate.",
    });
    writes.push(
      { kind: "preserve", path: relativePath, reason: "Invalid provenance manifest was preserved." },
      { kind: "suggest", path: suggestionPath, reason: "Review replacement manifest, then rerun upgrade." },
    );
    conflicts.push(relativePath);
  } else {
    writes.push(await writeManifest(cwd, nextManifest, Boolean(options.dryRun)));
  }

  const completed = conflicts.length === 0;
  const coversAllTargets = config.targets.every((target) => selectedTargets.includes(target));
  const installationComplete = completed && coversAllTargets;
  const nextConfig = { ...config, installedVersion: installationComplete ? CLI_VERSION : config.installedVersion };
  writes.push(await writeJsonIfChanged(cwd, ".akrctx/config.json", nextConfig, options, "akrctx config migration."));

  return {
    dryRun: Boolean(options.dryRun),
    fromVersion: config.installedVersion,
    toVersion: CLI_VERSION,
    selectedTargets,
    writes,
    conflicts,
    obsolete,
    completed,
    installationComplete,
  };
}

function resolveUpgradeTargets(config: akrctxConfig, requested: CommandOptions["target"]): Target[] {
  if (!requested || requested === "all") return [...config.targets];
  if (!config.targets.includes(requested)) {
    throw new Error(`Target ${requested} is not installed. Installed targets: ${config.targets.join(", ")}.`);
  }
  return [requested];
}

function desiredManagedFiles(config: akrctxConfig, targets: Target[]): Record<string, string> {
  const files: Record<string, string> = { ...comprehensionFiles, ...judgeContractFiles };
  for (const target of targets) {
    files[`.akrctx/targets/${target}.md`] = targetReferenceTemplates[target];
    if (target === "codex") Object.assign(files, codexSkills);
    if (target === "claude") Object.assign(files, claudeCommands, claudeSkills);
    if (target === "copilot") Object.assign(files, copilotFiles, copilotSkills);
    if (target === "pi") {
      Object.assign(files, piFiles, piSkills);
      files[".pi/README.md"] = "# Pi akrctx Harness\n\nThis directory contains akrctx prompts and skills for Pi.\n";
    }
    if (config.comprehensionGate.enabled && target in comprehensionAgents) {
      Object.assign(files, comprehensionAgents[target as keyof typeof comprehensionAgents]);
    }
    if (config.judge?.enabled && target in judgeAgents) {
      Object.assign(files, judgeAgents[target as keyof typeof judgeAgents]);
    }
  }
  return files;
}

async function upgradeManagedFile(
  cwd: string,
  relativePath: string,
  content: string,
  manifest: akrctxManifest | undefined,
  options: CommandOptions,
): Promise<{ writes: WriteResult[]; conflict: boolean; appliedHash?: string }> {
  const absolute = path.join(cwd, relativePath);
  const desired = ensureTrailingNewline(content);
  const desiredHash = templateHash(content);
  if (!(await pathExists(absolute))) {
    const write = await writePlannedFile(cwd, relativePath, desired, {
      dryRun: options.dryRun,
      reason: "New akrctx-managed file introduced by upgrade.",
    });
    return { writes: [write], conflict: false, appliedHash: desiredHash };
  }

  const current = await readFile(absolute);
  const currentHash = contentHash(current);
  if (currentHash === desiredHash) {
    return {
      writes: [{ kind: "preserve", path: relativePath, reason: "Already matches the current template." }],
      conflict: false,
      appliedHash: desiredHash,
    };
  }

  if (manifest?.files[relativePath]?.hash === currentHash) {
    const write = await writePlannedFile(cwd, relativePath, desired, {
      dryRun: options.dryRun,
      force: true,
      reason: "Updated verified akrctx-managed file.",
    });
    return { writes: [write], conflict: false, appliedHash: desiredHash };
  }

  const suggestionPath = path.posix.join(".akrctx", "upgrades", CLI_VERSION, relativePath);
  await writePlannedFile(cwd, suggestionPath, desired, {
    dryRun: options.dryRun,
    reason: `Upgrade candidate for ${relativePath}.`,
  });
  return {
    writes: [
      {
        kind: "preserve",
        path: relativePath,
        reason: "Preserved because installed provenance is missing or content changed.",
      },
      { kind: "suggest", path: suggestionPath, reason: `Review and merge into ${relativePath}.` },
    ],
    conflict: true,
  };
}

function rootInstruction(target: Target): { path: string; content: string } | undefined {
  if (target === "codex") return { path: "AGENTS.md", content: mainInstructionTemplate("codex") };
  if (target === "claude") return { path: "CLAUDE.md", content: mainInstructionTemplate("claude") };
  if (target === "copilot") {
    return { path: ".github/copilot-instructions.md", content: mainInstructionTemplate("copilot") };
  }
  return undefined;
}

async function preserveRootInstruction(
  cwd: string,
  relativePath: string,
  content: string,
  options: CommandOptions,
): Promise<WriteResult[]> {
  const absolute = path.join(cwd, relativePath);
  if (!(await pathExists(absolute))) {
    return [
      await writePlannedFile(cwd, relativePath, content, {
        dryRun: options.dryRun,
        reason: "Missing root instruction file restored.",
      }),
    ];
  }
  if (contentHash(await readFile(absolute)) === templateHash(content)) {
    return [{ kind: "preserve", path: relativePath, reason: "Root instructions already current." }];
  }
  const suggestionPath = path.posix.join(".akrctx", "upgrades", CLI_VERSION, relativePath);
  await writePlannedFile(cwd, suggestionPath, content, { dryRun: options.dryRun });
  return [
    { kind: "preserve", path: relativePath, reason: "Project-owned root instructions are never overwritten." },
    { kind: "suggest", path: suggestionPath, reason: `Optional merge candidate for ${relativePath}.` },
  ];
}

async function preserveProjectKnowledge(
  cwd: string,
  config: akrctxConfig,
  options: CommandOptions,
): Promise<WriteResult[]> {
  const projectName = await readProjectName(cwd);
  const files: Record<string, string> = {
    ".akrctx/local/.gitignore": localComprehensionIgnoreTemplate,
    ".akrctx/wiki/overview.md": overviewTemplate(projectName, config.targets, CLI_VERSION),
    ...Object.fromEntries(
      Object.entries(wikiTemplates).map(([relativePath, content]) => [
        path.posix.join(".akrctx", relativePath),
        content,
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(taskTemplateFiles).map(([relativePath, content]) => [
        path.posix.join(".akrctx", relativePath),
        content,
      ]),
    ),
  };
  const writes: WriteResult[] = [];
  for (const [relativePath, content] of Object.entries(files)) {
    if (await pathExists(path.join(cwd, relativePath))) {
      writes.push({ kind: "preserve", path: relativePath, reason: "Project-owned knowledge is never overwritten." });
    } else {
      writes.push(
        await writePlannedFile(cwd, relativePath, content, {
          dryRun: options.dryRun,
          reason: "Missing project-owned foundation file created without modifying existing knowledge.",
        }),
      );
    }
  }
  return writes;
}

async function migratePolicy(
  cwd: string,
  config: akrctxConfig,
  options: CommandOptions,
): Promise<{ writes: WriteResult[]; conflict: boolean }> {
  const profile = config.profile ?? "default";
  const relativePath = ".akrctx/policy.json";
  const absolute = path.join(cwd, relativePath);
  if (!(await pathExists(absolute))) {
    return {
      writes: [
        await writeJsonIfChanged(cwd, relativePath, defaultPolicy(profile), options, "Missing policy restored."),
      ],
      conflict: false,
    };
  }
  let current: Partial<akrctxPolicy>;
  try {
    current = JSON.parse(await readFile(absolute, "utf8"));
  } catch {
    const suggestionPath = path.posix.join(".akrctx", "upgrades", CLI_VERSION, relativePath);
    await writePlannedFile(cwd, suggestionPath, `${JSON.stringify(defaultPolicy(profile), null, 2)}\n`, {
      dryRun: options.dryRun,
      reason: "Safe policy replacement candidate.",
    });
    return {
      writes: [
        { kind: "preserve", path: relativePath, reason: "Invalid policy JSON was preserved." },
        { kind: "suggest", path: suggestionPath, reason: "Repair policy manually, then rerun upgrade." },
      ],
      conflict: true,
    };
  }
  const migrated = mergeTemplateJson(defaultPolicy(profile), current);
  return {
    writes: [await writeJsonIfChanged(cwd, relativePath, migrated, options, "akrctx policy migration.")],
    conflict: false,
  };
}

async function writeJsonIfChanged(
  cwd: string,
  relativePath: string,
  value: unknown,
  options: CommandOptions,
  reason: string,
): Promise<WriteResult> {
  const next = `${JSON.stringify(value, null, 2)}\n`;
  const absolute = path.join(cwd, relativePath);
  const current = await readFile(absolute, "utf8").catch(() => undefined);
  if (current === next) return { kind: "preserve", path: relativePath, reason: "No migration needed." };
  return writePlannedFile(cwd, relativePath, next, { dryRun: options.dryRun, force: true, reason });
}

async function readProjectName(cwd: string): Promise<string> {
  try {
    const pkg = JSON.parse(await readFile(path.join(cwd, "package.json"), "utf8"));
    if (typeof pkg.name === "string" && pkg.name.trim()) return pkg.name.trim();
  } catch {
    // Fall back to the directory name.
  }
  return path.basename(cwd);
}
