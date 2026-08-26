import { readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { agentFiles, agentWarningTexts, hasAgentFormat, resolveAgents } from "./agents.js";
import { readConfig } from "./config.js";
import { ensureTrailingNewline, pathExists, toPosix, writePlannedFile } from "./fs-utils.js";
import { upgradesDir, upgradesIgnorePath } from "./harness-files.js";
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
  claudeSkills,
  codexSkills,
  comprehensionFiles,
  copilotFiles,
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
  upgradesIgnoreTemplate,
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
  removed: string[];
  completed: boolean;
  installationComplete: boolean;
  warnings: string[];
}

export async function runUpgrade(options: CommandOptions): Promise<UpgradeResult> {
  const cwd = options.cwd ?? process.cwd();
  const config = await readConfig(cwd);
  if (!config) throw new Error("akrctx is not installed. Run `akrctx init` first.");
  const selectedTargets = resolveUpgradeTargets(config, options.target);
  const manifestExists = await pathExists(path.join(cwd, ".akrctx/manifest.json"));
  const previousManifest = await readManifest(cwd);
  const invalidManifest = manifestExists && !previousManifest;
  const nextManifest: akrctxManifest = {
    schemaVersion: 1,
    cliVersion: CLI_VERSION,
    files: { ...(previousManifest?.files ?? {}) },
    candidates: { ...(previousManifest?.candidates ?? {}) },
  };
  const writes: WriteResult[] = [];
  const conflicts: string[] = [];
  const createdCandidates = new Set<string>();

  const desired = desiredManagedFiles(config, selectedTargets);
  for (const [relativePath, content] of Object.entries(desired)) {
    const result = await upgradeManagedFile(cwd, relativePath, content, previousManifest, options);
    writes.push(...result.writes);
    if (result.conflict) conflicts.push(relativePath);
    if (result.appliedHash) nextManifest.files[relativePath] = { hash: result.appliedHash };
    if (result.createdCandidate) createdCandidates.add(result.createdCandidate);
  }

  for (const target of selectedTargets) {
    const root = rootInstruction(target);
    if (!root) continue;
    const rootResult = await preserveRootInstruction(cwd, root.path, root.content, options);
    writes.push(...rootResult.writes);
    if (rootResult.createdCandidate) createdCandidates.add(rootResult.createdCandidate);
  }

  writes.push(...(await preserveProjectKnowledge(cwd, config, options)));
  const policyMigration = await migratePolicy(cwd, config, options);
  writes.push(...policyMigration.writes);
  if (policyMigration.conflict) conflicts.push(".akrctx/policy.json");
  if (policyMigration.createdCandidate) createdCandidates.add(policyMigration.createdCandidate);

  const allDesiredPaths = new Set(Object.keys(desiredManagedFiles(config, config.targets)));
  const templateOwnedPaths = new Set(config.templatePacks.flatMap((pack) => Object.keys(pack.fileHashes)));
  const obsolete = Object.keys(previousManifest?.files ?? {}).filter(
    (relativePath) =>
      isManifestManagedPath(relativePath) &&
      !allDesiredPaths.has(relativePath) &&
      !templateOwnedPaths.has(relativePath),
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
    const suggestion = await writePlannedFile(cwd, suggestionPath, `${JSON.stringify(nextManifest, null, 2)}\n`, {
      dryRun: options.dryRun,
      reason: "Replacement provenance manifest candidate.",
    });
    if (suggestion.kind === "create") createdCandidates.add(suggestion.path);
    writes.push(
      { kind: "preserve", path: relativePath, reason: "Invalid provenance manifest was preserved." },
      {
        ...asCandidateWrite(suggestion),
        reason: suggestion.reason ?? "Review replacement manifest, then rerun upgrade.",
      },
    );
    conflicts.push(relativePath);
  }

  if (!options.dryRun) await recordUpgradeCandidates(cwd, nextManifest, writes, createdCandidates);

  const completed = conflicts.length === 0;
  const coversAllTargets = config.targets.every((target) => selectedTargets.includes(target));
  const installationComplete = completed && coversAllTargets;
  const nextConfig = { ...config, installedVersion: installationComplete ? CLI_VERSION : config.installedVersion };
  writes.push(await writeJsonIfChanged(cwd, ".akrctx/config.json", nextConfig, options, "akrctx config migration."));

  const removed = coversAllTargets ? await removeResolvedCandidates(cwd, nextManifest, writes, options) : [];
  if (!invalidManifest) writes.push(await writeManifest(cwd, nextManifest, Boolean(options.dryRun)));

  return {
    dryRun: Boolean(options.dryRun),
    fromVersion: config.installedVersion,
    toVersion: CLI_VERSION,
    selectedTargets,
    writes,
    conflicts,
    obsolete,
    removed,
    completed,
    installationComplete,
    warnings: agentWarningTexts(config),
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
    // Agent files are a function of the resolved `agents` configuration, so a configured
    // model survives regeneration instead of being overwritten by a constant.
    if (!hasAgentFormat(target)) continue;
    for (const agent of Object.values(resolveAgents(config))) {
      if (!agent.enabled || !agent.targets.includes(target)) continue;
      Object.assign(files, agentFiles(agent.name, target, agent.model[target]));
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
): Promise<{ writes: WriteResult[]; conflict: boolean; appliedHash?: string; createdCandidate?: string }> {
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
  const suggestion = await writePlannedFile(cwd, suggestionPath, desired, {
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
      { ...asCandidateWrite(suggestion), reason: suggestion.reason ?? `Review and merge into ${relativePath}.` },
    ],
    conflict: true,
    createdCandidate: suggestion.kind === "create" ? suggestion.path : undefined,
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
): Promise<{ writes: WriteResult[]; createdCandidate?: string }> {
  const absolute = path.join(cwd, relativePath);
  if (!(await pathExists(absolute))) {
    return {
      writes: [
        await writePlannedFile(cwd, relativePath, content, {
          dryRun: options.dryRun,
          reason: "Missing root instruction file restored.",
        }),
      ],
    };
  }
  if (contentHash(await readFile(absolute)) === templateHash(content)) {
    return { writes: [{ kind: "preserve", path: relativePath, reason: "Root instructions already current." }] };
  }
  const suggestionPath = path.posix.join(".akrctx", "upgrades", CLI_VERSION, relativePath);
  const suggestion = await writePlannedFile(cwd, suggestionPath, content, { dryRun: options.dryRun });
  return {
    writes: [
      { kind: "preserve", path: relativePath, reason: "Project-owned root instructions are never overwritten." },
      { ...asCandidateWrite(suggestion), reason: suggestion.reason ?? `Optional merge candidate for ${relativePath}.` },
    ],
    createdCandidate: suggestion.kind === "create" ? suggestion.path : undefined,
  };
}

/**
 * Deletes the candidates this run did not write.
 *
 * A candidate that is still unresolved is rewritten by the same run, so only resolved ones
 * are absent from `writes`. The caller skips this entirely when the run does not cover every
 * installed target, because the untouched targets' candidates would look resolved without
 * being so. Older version directories are never scanned: their candidates cannot be
 * regenerated, so removing them would destroy a suggestion nobody accepted.
 */
async function removeResolvedCandidates(
  cwd: string,
  manifest: akrctxManifest,
  writes: WriteResult[],
  options: CommandOptions,
): Promise<string[]> {
  const versionDir = path.posix.join(upgradesDir, CLI_VERSION);
  const absoluteDir = path.join(cwd, versionDir);
  if (!(await pathExists(absoluteDir))) return [];

  const written = new Set(writes.filter((write) => write.kind === "suggest").map((write) => write.path));
  const entries = await readdir(absoluteDir, { recursive: true, withFileTypes: true });
  const candidates = entries
    .filter((entry) => entry.isFile())
    .map((entry) => toPosix(path.relative(cwd, path.join(entry.parentPath, entry.name))))
    .sort();
  const stale: string[] = [];
  for (const relativePath of candidates) {
    if (written.has(relativePath)) continue;
    if (await candidateMatchesDestination(cwd, versionDir, relativePath, manifest.candidates?.[relativePath])) {
      stale.push(relativePath);
    }
  }

  if (!options.dryRun) {
    for (const relativePath of stale) await rm(path.join(cwd, relativePath), { force: true });
    for (const relativePath of stale) delete manifest.candidates?.[relativePath];
    await removeEmptyDirectories(absoluteDir);
  }
  return stale;
}

/** A candidate is removable only with durable provenance, intact bytes, and an identical destination. */
async function candidateMatchesDestination(
  cwd: string,
  versionDir: string,
  candidatePath: string,
  provenance: { hash: string } | undefined,
): Promise<boolean> {
  const prefix = `${versionDir}/`;
  if (!provenance || !candidatePath.startsWith(prefix)) return false;
  const destination = candidatePath.slice(prefix.length);
  try {
    const [candidate, applied] = await Promise.all([
      readFile(path.join(cwd, candidatePath)),
      readFile(path.join(cwd, destination)),
    ]);
    return contentHash(candidate) === provenance.hash && candidate.equals(applied);
  } catch {
    return false;
  }
}

async function recordUpgradeCandidates(
  cwd: string,
  manifest: akrctxManifest,
  writes: WriteResult[],
  createdCandidates: Set<string>,
): Promise<void> {
  if (!manifest.candidates) manifest.candidates = {};
  const candidates = manifest.candidates;
  for (const write of writes) {
    if (!createdCandidates.has(write.path) || !write.path.startsWith(`${upgradesDir}/${CLI_VERSION}/`)) continue;
    const candidate = await readFile(path.join(cwd, write.path));
    candidates[write.path] = { hash: contentHash(candidate) };
  }
}

function asCandidateWrite(write: WriteResult): WriteResult {
  return { ...write, kind: write.kind === "create" ? "suggest" : write.kind };
}

/** Removes a directory tree bottom-up, stopping at the first level that still holds content. */
async function removeEmptyDirectories(absoluteDir: string): Promise<boolean> {
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  let empty = true;
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      empty = false;
      continue;
    }
    if (!(await removeEmptyDirectories(path.join(absoluteDir, entry.name)))) empty = false;
  }
  if (empty) await rm(absoluteDir, { recursive: true, force: true });
  return empty;
}

async function preserveProjectKnowledge(
  cwd: string,
  config: akrctxConfig,
  options: CommandOptions,
): Promise<WriteResult[]> {
  const projectName = await readProjectName(cwd);
  const files: Record<string, string> = {
    ".akrctx/local/.gitignore": localComprehensionIgnoreTemplate,
    [upgradesIgnorePath]: upgradesIgnoreTemplate,
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
    const absolute = path.join(cwd, relativePath);
    if (relativePath === ".akrctx/wiki/index.md" && (await pathExists(absolute))) {
      const current = await readFile(absolute, "utf8");
      const auditLink = "[Instruction Audit](/wiki/instruction-audit.md)";
      if (!current.includes(auditLink)) {
        writes.push(
          await writePlannedFile(
            cwd,
            relativePath,
            `${ensureTrailingNewline(current)}- ${auditLink} — Persistent semantic review of instruction placement.\n`,
            {
              dryRun: options.dryRun,
              force: true,
              reason:
                "Added the new instruction-audit page to the existing wiki index without replacing project knowledge.",
            },
          ),
        );
      } else {
        writes.push({ kind: "preserve", path: relativePath, reason: "Project-owned knowledge is never overwritten." });
      }
    } else if (await pathExists(absolute)) {
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
): Promise<{ writes: WriteResult[]; conflict: boolean; createdCandidate?: string }> {
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
    const suggestion = await writePlannedFile(
      cwd,
      suggestionPath,
      `${JSON.stringify(defaultPolicy(profile), null, 2)}\n`,
      {
        dryRun: options.dryRun,
        reason: "Safe policy replacement candidate.",
      },
    );
    return {
      writes: [
        { kind: "preserve", path: relativePath, reason: "Invalid policy JSON was preserved." },
        { ...asCandidateWrite(suggestion), reason: suggestion.reason ?? "Repair policy manually, then rerun upgrade." },
      ],
      conflict: true,
      createdCandidate: suggestion.kind === "create" ? suggestion.path : undefined,
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
