import { rm } from "node:fs/promises";
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

export async function runRemove(options: CommandOptions & { all?: boolean }): Promise<RemoveResult> {
  const cwd = options.cwd ?? process.cwd();
  // Default to dry-run unless --force is explicitly passed.
  const dryRun = options.dryRun ?? !options.force;

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
    }
  }

  // Handle .akrctx/ removal only when --all is set.
  if ((options as { all?: boolean }).all) {
    const cfDir = path.join(cwd, ".akrctx");
    if (await pathExists(cfDir)) {
      planned.push(".akrctx/");
      if (!dryRun) {
        await rm(cfDir, { recursive: true, force: true });
      }
    }
  }

  return { planned, protected: skippedProtected, dryRun };
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
