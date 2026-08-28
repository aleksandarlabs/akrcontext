import { readdir, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { agentFilePathList } from "./agents.js";
import { pathExists } from "./fs-utils.js";
import { protectedFiles, targetRequired } from "./harness-files.js";
import { unwireTraceTargets } from "./hook/install.js";
import type { CommandOptions, Target } from "./types.js";
import { agentNames, targets } from "./types.js";

export interface RemoveResult {
  /** Files that were removed (or would be removed in dry-run). */
  planned: string[];
  /** Shared host settings updated only to remove akrctx-owned trace entries. */
  updated: string[];
  /** Protected files that were skipped (require manual action). */
  protected: string[];
  dryRun: boolean;
}

export async function runRemove(
  options: CommandOptions & { all?: boolean; purgeTasks?: boolean; purgeLocal?: boolean },
): Promise<RemoveResult> {
  const cwd = options.cwd ?? process.cwd();
  // Default to dry-run unless --force is explicitly passed.
  const dryRun = options.dryRun || !options.force;

  // Trace wiring lives in shared host settings rather than in targetRequired. Remove its
  // owned entries first, while config and the pinned CLI still exist. For --all, inspect
  // every host rather than trusting a possibly stale targets list in config.json.
  const updated = await unwireTraceTargets(cwd, removalTargets(options), { dryRun });

  const candidates = collectCandidates(options);

  // Check which candidates actually exist.
  const existence = await Promise.all(
    candidates.map(async (file) => ({ file, exists: await pathExists(path.join(cwd, file)) })),
  );
  const present = existence.filter((e) => e.exists).map((e) => e.file);

  const planned: string[] = [];
  const skippedProtected: string[] = [];

  for (const file of present) {
    if (protectedFiles.includes(file)) {
      skippedProtected.push(file);
      continue;
    }
    planned.push(file);
    if (!dryRun) {
      await rm(path.join(cwd, file), { recursive: true, force: true });
      const prunedDirs = await pruneEmptyAncestors(cwd, file);
      planned.push(...prunedDirs);
    }
  }

  if (dryRun) {
    planned.push(...(await simulatePrunedDirs(cwd, planned)));
  }

  // Handle .akrctx/ removal only when --all is set.
  if (options.all) {
    const cfDir = path.join(cwd, ".akrctx");
    if (await pathExists(cfDir)) {
      const upgradeCandidateLedger = path.join(cfDir, "local/upgrade-candidates.json");
      const ledgerExists = await pathExists(upgradeCandidateLedger);
      const tasksDir = path.join(cfDir, "tasks");
      const hasTaskCapsules = !options.purgeTasks && (await hasAnyTaskCapsule(tasksDir));
      const hasLocalRecords =
        !options.purgeLocal &&
        (await hasAnyLocalRecord(path.join(cfDir, "local"), ledgerExists ? ["upgrade-candidates.json"] : []));
      const preservedEntries = new Set<string>();
      if (hasTaskCapsules) preservedEntries.add("tasks");
      if (hasLocalRecords) preservedEntries.add("local");

      if (preservedEntries.size > 0) {
        // Preserve durable user records — remove everything else in .akrctx/.
        if (hasLocalRecords && ledgerExists) {
          planned.push(".akrctx/local/upgrade-candidates.json");
          if (!dryRun) await rm(upgradeCandidateLedger, { force: true });
        }
        const entries = await readdir(cfDir, { withFileTypes: true });
        for (const entry of entries) {
          if (preservedEntries.has(entry.name)) continue;
          const relative = `.akrctx/${entry.name}${entry.isDirectory() ? "/" : ""}`;
          planned.push(relative);
          if (!dryRun) {
            await rm(path.join(cfDir, entry.name), { recursive: true, force: true });
          }
        }
        if (hasTaskCapsules) skippedProtected.push(".akrctx/tasks/ (kept — use --purge-tasks to delete)");
        if (hasLocalRecords)
          skippedProtected.push(".akrctx/local/ (kept — use --purge-local to delete personal records)");
      } else {
        planned.push(".akrctx/");
        if (!dryRun) {
          await rm(cfDir, { recursive: true, force: true });
        }
      }
    }
  }

  return { planned, updated, protected: skippedProtected, dryRun };
}

async function pruneEmptyAncestors(cwd: string, relativePath: string): Promise<string[]> {
  const removed: string[] = [];
  let relativeDir = path.posix.dirname(relativePath);

  while (relativeDir && relativeDir !== ".") {
    const absoluteDir = path.join(cwd, relativeDir);
    if (!(await isEmptyDirectory(absoluteDir))) break;

    await rmdir(absoluteDir);
    removed.push(`${relativeDir}/`);
    relativeDir = path.posix.dirname(relativeDir);
  }

  return removed;
}

async function hasAnyTaskCapsule(tasksDir: string): Promise<boolean> {
  try {
    const entries = await readdir(tasksDir, { withFileTypes: true });
    return entries.some((entry) => entry.isDirectory() && /^TASK-\d+/.test(entry.name));
  } catch {
    return false;
  }
}

async function hasAnyLocalRecord(localDir: string, ignoredEntries: string[] = []): Promise<boolean> {
  try {
    const entries = await readdir(localDir, { withFileTypes: true });
    return entries.some((entry) => entry.name !== ".gitignore" && !ignoredEntries.includes(entry.name));
  } catch {
    return false;
  }
}

async function isEmptyDirectory(directoryPath: string): Promise<boolean> {
  try {
    return (await readdir(directoryPath)).length === 0;
  } catch {
    return false;
  }
}

/**
 * Dry-run only: predict which ancestor directories of the planned files would
 * end up empty (and therefore pruned) if the removal actually ran, so the
 * preview matches what --force would do.
 */
async function simulatePrunedDirs(cwd: string, plannedFiles: string[]): Promise<string[]> {
  const removed = new Set<string>(plannedFiles);
  const dirsToCheck = new Set<string>();
  for (const file of plannedFiles) {
    let dir = path.posix.dirname(file);
    while (dir && dir !== ".") {
      dirsToCheck.add(dir);
      dir = path.posix.dirname(dir);
    }
  }

  // Deepest directories first so a pruned child dir can make its parent
  // eligible for pruning too.
  const sortedDirs = Array.from(dirsToCheck).sort((a, b) => b.split("/").length - a.split("/").length);

  const prunedDirs: string[] = [];
  for (const dir of sortedDirs) {
    let entries: string[];
    try {
      entries = await readdir(path.join(cwd, dir));
    } catch {
      continue;
    }
    if (entries.length === 0) continue;
    const allEntriesRemoved = entries.every((entry) => removed.has(path.posix.join(dir, entry)));
    if (allEntriesRemoved) {
      removed.add(dir);
      prunedDirs.push(`${dir}/`);
    }
  }

  return prunedDirs;
}

function collectCandidates(options: CommandOptions & { all?: boolean }): string[] {
  const candidates: string[] = [];

  if (options.all) {
    for (const target of targets) {
      candidates.push(...targetRequired[target]);
      candidates.push(...agentCandidates(target));
    }
    // .akrctx/ is handled separately above via rm -r
    return candidates;
  }

  const target = options.target;
  if (!target) return [];

  if (target === "all") {
    for (const t of targets) {
      candidates.push(...targetRequired[t]);
      candidates.push(...agentCandidates(t));
    }
    return candidates;
  }

  candidates.push(...targetRequired[target as Target]);
  candidates.push(...agentCandidates(target as Target));
  return candidates;
}

function removalTargets(options: CommandOptions & { all?: boolean }): Target[] {
  if (options.all || options.target === "all") return [...targets];
  return options.target && targets.includes(options.target as Target) ? [options.target as Target] : [];
}

function agentCandidates(target: Target): string[] {
  return agentNames.flatMap((name) => agentFilePathList(name, [target]));
}
