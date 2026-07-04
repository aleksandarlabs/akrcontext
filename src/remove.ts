import { readdir, rm, rmdir } from "node:fs/promises";
import path from "node:path";
import { pathExists } from "./fs-utils.js";
import { protectedFiles, targetRequired } from "./harness-files.js";
import type { CommandOptions, Target } from "./types.js";
import { targets } from "./types.js";

export interface RemoveResult {
  /** Files that were removed (or would be removed in dry-run). */
  planned: string[];
  /** Protected files that were skipped (require manual action). */
  protected: string[];
  dryRun: boolean;
}

export async function runRemove(
  options: CommandOptions & { all?: boolean; purgeTasks?: boolean },
): Promise<RemoveResult> {
  const cwd = options.cwd ?? process.cwd();
  // Default to dry-run unless --force is explicitly passed.
  const dryRun = options.dryRun || !options.force;

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
      const tasksDir = path.join(cfDir, "tasks");
      const hasTaskCapsules = !options.purgeTasks && (await hasAnyTaskCapsule(tasksDir));

      if (hasTaskCapsules) {
        // Preserve .akrctx/tasks/ — remove everything else in .akrctx/.
        const entries = await readdir(cfDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === "tasks") continue;
          const relative = `.akrctx/${entry.name}${entry.isDirectory() ? "/" : ""}`;
          planned.push(relative);
          if (!dryRun) {
            await rm(path.join(cfDir, entry.name), { recursive: true, force: true });
          }
        }
        skippedProtected.push(".akrctx/tasks/ (kept — contains task capsules; delete manually)");
      } else {
        planned.push(".akrctx/");
        if (!dryRun) {
          await rm(cfDir, { recursive: true, force: true });
        }
      }
    }
  }

  return { planned, protected: skippedProtected, dryRun };
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
    }
    // .akrctx/ is handled separately above via rm -r
    return candidates;
  }

  const target = options.target;
  if (!target) return [];

  if (target === "all") {
    for (const t of targets) {
      candidates.push(...targetRequired[t]);
    }
    return candidates;
  }

  candidates.push(...targetRequired[target as Target]);
  return candidates;
}
