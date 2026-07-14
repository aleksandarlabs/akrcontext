import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ensureTrailingNewline, pathExists } from "./fs-utils.js";
import type { WriteResult } from "./types.js";

export const manifestPath = ".akrctx/manifest.json";

export interface ManagedFileRecord {
  hash: string;
}

export interface akrctxManifest {
  schemaVersion: 1;
  cliVersion: string;
  files: Record<string, ManagedFileRecord>;
}

export function contentHash(content: string | Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

export function templateHash(content: string): string {
  return contentHash(ensureTrailingNewline(content));
}

export async function readManifest(cwd: string): Promise<akrctxManifest | undefined> {
  try {
    const value = JSON.parse(await readFile(path.join(cwd, manifestPath), "utf8"));
    if (value?.schemaVersion !== 1 || typeof value.cliVersion !== "string" || !value.files) return undefined;
    if (
      typeof value.files !== "object" ||
      Array.isArray(value.files) ||
      !Object.entries(value.files).every(
        ([relativePath, entry]) =>
          isSafeManifestPath(relativePath) &&
          entry &&
          typeof entry === "object" &&
          /^sha256:[0-9a-f]{64}$/.test(String((entry as ManagedFileRecord).hash)),
      )
    ) {
      return undefined;
    }
    return value as akrctxManifest;
  } catch {
    return undefined;
  }
}

function isSafeManifestPath(relativePath: string): boolean {
  return (
    relativePath.length > 0 &&
    !path.posix.isAbsolute(relativePath) &&
    !relativePath.includes("\\") &&
    !relativePath.split("/").includes("..")
  );
}

export async function writeManifest(cwd: string, manifest: akrctxManifest, dryRun = false): Promise<WriteResult> {
  const absolute = path.join(cwd, manifestPath);
  const exists = await pathExists(absolute);
  const next = `${JSON.stringify(manifest, null, 2)}\n`;
  const current = exists ? await readFile(absolute, "utf8").catch(() => undefined) : undefined;
  if (current === next) {
    return { kind: "preserve", path: manifestPath, reason: "Managed-file provenance is already current." };
  }
  if (!dryRun) {
    await mkdir(path.join(cwd, ".akrctx"), { recursive: true });
    await writeFile(absolute, next, "utf8");
  }
  return {
    kind: exists ? "update" : "create",
    path: manifestPath,
    reason: "akrctx managed-file provenance manifest.",
  };
}

export function isManifestManagedPath(relativePath: string): boolean {
  if (relativePath === ".pi/README.md") return true;
  return [
    ".agents/skills/",
    ".claude/commands/",
    ".claude/skills/",
    ".github/instructions/",
    ".github/prompts/",
    ".github/skills/",
    ".pi/prompts/",
    ".pi/skills/",
    ".akrctx/targets/",
    ".akrctx/comprehension/",
    ".akrctx/judge/",
  ].some((prefix) => relativePath.startsWith(prefix));
}

export async function createManifestFromWrites(
  cwd: string,
  writes: WriteResult[],
  cliVersion: string,
  dryRun = false,
): Promise<WriteResult> {
  const previous = await readManifest(cwd);
  const files = { ...(previous?.files ?? {}) };
  if (!dryRun) {
    for (const write of writes) {
      if (!isManifestManagedPath(write.path) || !["create", "update"].includes(write.kind)) continue;
      const content = await readFile(path.join(cwd, write.path));
      files[write.path] = { hash: contentHash(content) };
    }
  }
  return writeManifest(cwd, { schemaVersion: 1, cliVersion, files }, dryRun);
}
