import { access, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WriteResult } from "./types.js";

export async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}

export async function readTextIfExists(filePath: string): Promise<string | undefined> {
  if (!(await pathExists(filePath))) return undefined;
  return readFile(filePath, "utf8");
}

export async function listDirs(filePath: string): Promise<string[]> {
  if (!(await isDirectory(filePath))) return [];
  const entries = await readdir(filePath, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

export function toPosix(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function suggestedPathFor(relativePath: string): string {
  const parsed = path.posix.parse(relativePath);
  const ext = parsed.ext || ".md";
  const base = parsed.base.endsWith(ext) ? parsed.base.slice(0, -ext.length) : parsed.base;
  return path.posix.join(parsed.dir, `${base}.akrctx.suggested${ext}`);
}

export async function writePlannedFile(
  cwd: string,
  relativePath: string,
  content: string,
  options: { dryRun?: boolean; force?: boolean; protected?: boolean; reason?: string } = {},
): Promise<WriteResult> {
  const targetPath = path.join(cwd, relativePath);
  const exists = await pathExists(targetPath);

  if (exists && options.protected) {
    const suggested = suggestedPathFor(relativePath);
    const suggestedAbsolute = path.join(cwd, suggested);
    const suggestedExists = await pathExists(suggestedAbsolute);
    if (!options.dryRun && !suggestedExists) {
      await mkdir(path.dirname(suggestedAbsolute), { recursive: true });
      await writeFile(suggestedAbsolute, content, "utf8");
    }
    return {
      kind: suggestedExists ? "preserve" : "suggest",
      path: suggested,
      reason: suggestedExists ? `Preserved existing ${relativePath}; suggestion already exists.` : options.reason,
    };
  }

  if (exists && !options.force) {
    return { kind: "preserve", path: relativePath, reason: "Existing file preserved." };
  }

  const nextContent = ensureTrailingNewline(content);

  if (exists && (await readFile(targetPath, "utf8").catch(() => undefined)) === nextContent) {
    return { kind: "preserve", path: relativePath, reason: "Already current." };
  }

  if (!options.dryRun) {
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, nextContent, "utf8");
  }

  return {
    kind: exists ? "update" : "create",
    path: relativePath,
    reason: exists ? "Regenerated from the current configuration." : options.reason,
  };
}

export function ensureTrailingNewline(content: string): string {
  return content.endsWith("\n") ? content : `${content}\n`;
}
