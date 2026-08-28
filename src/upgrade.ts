import type { Dirent } from "node:fs";
import { lstat, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { agentFiles, agentWarningTexts, hasAgentFormat, resolveAgents } from "./agents.js";
import { readConfig } from "./config.js";
import { ensureTrailingNewline, pathExists, toPosix, writePlannedFile } from "./fs-utils.js";
import { upgradesDir, upgradesIgnorePath } from "./harness-files.js";
import {
  type akrctxManifest,
  contentHash,
  isManifestManagedPath,
  manifestPath,
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

const externalCandidateLedgerPath = ".akrctx/local/upgrade-candidates.json";
const externalCandidateLedgerVersion = 1;
type ExternalCandidateLedger = Record<string, { hash: string }>;

type CandidateDirent = Pick<Dirent, "name" | "isDirectory" | "isFile" | "isSymbolicLink">;
type CandidateDirectoryReader = (directory: string) => Promise<readonly CandidateDirent[]>;

/** Lists regular files below a directory without relying on post-Node-20 recursive APIs. */
export async function collectRegularFiles(
  root: string,
  readDirectory: CandidateDirectoryReader = async (directory) => readdir(directory, { withFileTypes: true }),
  base = root,
): Promise<string[]> {
  const files: string[] = [];
  const rootInfo = await lstat(root).catch(() => undefined);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) return files;

  async function walk(directory: string): Promise<void> {
    const entries = [...(await readDirectory(directory))].sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(child);
      } else if (entry.isFile()) {
        files.push(toPosix(path.relative(base, child)));
      }
    }
  }

  await walk(root);
  return files.sort();
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
  const externalCandidates = await readExternalCandidateLedger(cwd);
  const candidates = new UpgradeCandidateWriter(cwd, nextManifest, externalCandidates, options);

  const desired = desiredManagedFiles(config, selectedTargets);
  for (const [relativePath, content] of Object.entries(desired)) {
    const result = await upgradeManagedFile(cwd, relativePath, content, previousManifest, options, candidates);
    writes.push(...result.writes);
    if (result.conflict) conflicts.push(relativePath);
    if (result.appliedHash) nextManifest.files[relativePath] = { hash: result.appliedHash };
  }

  for (const target of selectedTargets) {
    const root = rootInstruction(target);
    if (!root) continue;
    const rootResult = await preserveRootInstruction(cwd, root.path, root.content, options, candidates);
    writes.push(...rootResult.writes);
  }

  writes.push(...(await preserveProjectKnowledge(cwd, config, options)));
  const policyMigration = await migratePolicy(cwd, config, options, candidates);
  writes.push(...policyMigration.writes);
  if (policyMigration.conflict) conflicts.push(".akrctx/policy.json");

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
    const suggestion = await candidates.write(
      suggestionPath,
      `${JSON.stringify(nextManifest, null, 2)}\n`,
      "Replacement provenance manifest candidate.",
    );
    writes.push(
      { kind: "preserve", path: relativePath, reason: "Invalid provenance manifest was preserved." },
      {
        ...suggestion,
        reason: suggestion.reason ?? "Review replacement manifest, then rerun upgrade.",
      },
    );
    conflicts.push(relativePath);
  }

  const completed = conflicts.length === 0;
  const coversAllTargets = config.targets.every((target) => selectedTargets.includes(target));
  const installationComplete = completed && coversAllTargets;
  const nextConfig = { ...config, installedVersion: installationComplete ? CLI_VERSION : config.installedVersion };
  writes.push(await writeJsonIfChanged(cwd, ".akrctx/config.json", nextConfig, options, "akrctx config migration."));

  const removed = coversAllTargets
    ? await removeResolvedCandidates(cwd, nextManifest, externalCandidates, writes, options)
    : [];
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
  candidates: UpgradeCandidateWriter,
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
  const suggestion = await candidates.write(suggestionPath, desired, `Upgrade candidate for ${relativePath}.`);
  return {
    writes: [
      {
        kind: "preserve",
        path: relativePath,
        reason: "Preserved because installed provenance is missing or content changed.",
      },
      { ...suggestion, reason: suggestion.reason ?? `Review and merge into ${relativePath}.` },
    ],
    conflict: true,
  };
}

/** Writes an upgrade candidate and records provenance only after creating its file. */
class UpgradeCandidateWriter {
  constructor(
    private readonly cwd: string,
    private readonly manifest: akrctxManifest,
    private readonly externalCandidates: ExternalCandidateLedger,
    private readonly options: CommandOptions,
  ) {}

  async write(relativePath: string, content: string, reason?: string): Promise<WriteResult> {
    const write = await writePlannedFile(this.cwd, relativePath, content, {
      dryRun: this.options.dryRun,
      reason,
    });
    if (write.kind === "create" && !this.options.dryRun) {
      const candidate = await readFile(path.join(this.cwd, relativePath));
      const hash = contentHash(candidate);
      if (isManifestCandidate(relativePath)) this.externalCandidates[relativePath] = { hash };
      else {
        this.manifest.candidates ??= {};
        this.manifest.candidates[relativePath] = { hash };
      }
      await writeExternalCandidateLedger(this.cwd, this.externalCandidates);
    }
    return { ...write, kind: write.kind === "create" ? "suggest" : write.kind };
  }
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
  candidates: UpgradeCandidateWriter,
): Promise<{ writes: WriteResult[] }> {
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
  const suggestion = await candidates.write(suggestionPath, content);
  return {
    writes: [
      { kind: "preserve", path: relativePath, reason: "Project-owned root instructions are never overwritten." },
      { ...suggestion, reason: suggestion.reason ?? `Optional merge candidate for ${relativePath}.` },
    ],
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
  externalCandidates: ExternalCandidateLedger,
  writes: WriteResult[],
  options: CommandOptions,
): Promise<string[]> {
  const versionDir = path.posix.join(upgradesDir, CLI_VERSION);
  const absoluteDir = path.join(cwd, versionDir);
  if (!(await pathExists(absoluteDir))) {
    if (!options.dryRun) {
      for (const relativePath of Object.keys(externalCandidates)) delete externalCandidates[relativePath];
      await writeExternalCandidateLedger(cwd, externalCandidates);
    }
    return [];
  }
  const rootInfo = await lstat(absoluteDir).catch(() => undefined);
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) return [];

  const written = new Set(writes.filter((write) => write.kind === "suggest").map((write) => write.path));
  const candidates = await collectRegularFiles(absoluteDir, undefined, cwd);
  const stale: string[] = [];
  for (const relativePath of candidates) {
    if (written.has(relativePath)) continue;
    if (
      await candidateMatchesDestination(
        cwd,
        versionDir,
        relativePath,
        manifest.candidates?.[relativePath],
        externalCandidates[relativePath],
      )
    ) {
      stale.push(relativePath);
    }
  }

  if (!options.dryRun) {
    for (const relativePath of stale) await rm(path.join(cwd, relativePath), { force: true });
    for (const relativePath of stale) delete manifest.candidates?.[relativePath];
    for (const relativePath of stale) delete externalCandidates[relativePath];
    for (const relativePath of Object.keys(externalCandidates)) {
      if (!candidates.includes(relativePath)) delete externalCandidates[relativePath];
    }
    await writeExternalCandidateLedger(cwd, externalCandidates);
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
  externalProvenance: { hash: string } | undefined,
): Promise<boolean> {
  const prefix = `${versionDir}/`;
  if (!candidatePath.startsWith(prefix)) return false;
  const destination = candidatePath.slice(prefix.length);
  const recorded = destination === manifestPath ? externalProvenance : provenance;
  if (!recorded) return false;
  try {
    const [candidate, applied] = await Promise.all([
      readFile(path.join(cwd, candidatePath)),
      readFile(path.join(cwd, destination)),
    ]);
    return contentHash(candidate) === recorded.hash && candidate.equals(applied);
  } catch {
    return false;
  }
}

function isManifestCandidate(relativePath: string): boolean {
  return relativePath.endsWith(`/${manifestPath}`);
}

async function readExternalCandidateLedger(cwd: string): Promise<ExternalCandidateLedger> {
  try {
    const value = JSON.parse(await readFile(path.join(cwd, externalCandidateLedgerPath), "utf8"));
    if (
      value?.version !== externalCandidateLedgerVersion ||
      !value.candidates ||
      typeof value.candidates !== "object" ||
      Array.isArray(value.candidates)
    ) {
      return {};
    }
    return value.candidates as ExternalCandidateLedger;
  } catch {
    return {};
  }
}

async function writeExternalCandidateLedger(cwd: string, candidates: ExternalCandidateLedger): Promise<void> {
  const absolute = path.join(cwd, externalCandidateLedgerPath);
  if (Object.keys(candidates).length === 0) {
    await rm(absolute, { force: true });
    return;
  }
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(
    absolute,
    `${JSON.stringify({ version: externalCandidateLedgerVersion, candidates }, null, 2)}\n`,
    "utf8",
  );
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
  candidates: UpgradeCandidateWriter,
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
    const suggestion = await candidates.write(
      suggestionPath,
      `${JSON.stringify(defaultPolicy(profile), null, 2)}\n`,
      "Safe policy replacement candidate.",
    );
    return {
      writes: [
        { kind: "preserve", path: relativePath, reason: "Invalid policy JSON was preserved." },
        { ...suggestion, reason: suggestion.reason ?? "Repair policy manually, then rerun upgrade." },
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
