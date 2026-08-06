import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { JudgeScope } from "./judge-enforcement.js";

const execFileAsync = promisify(execFile);
const SNAPSHOT_ROOT = path.join(".akrctx", "local", "judge", "snapshots");
const SNAPSHOT_PREFIX = "SNAPSHOT:";
const SNAPSHOT_VERSION = 1;
const MAX_CAPTURE_ATTEMPTS = 3;

export interface JudgeSnapshotParent {
  snapshotId: string;
  scopeDigest: string;
  recordPath: string;
  recordDigest: string;
}

export interface JudgeSnapshotMetadata {
  version: typeof SNAPSHOT_VERSION;
  id: string;
  taskId: string;
  workspaceDigest: string;
  sourceScope: JudgeScope;
  scope: JudgeScope;
  parent?: JudgeSnapshotParent;
}

export interface JudgeSnapshot {
  id: string;
  candidate: string;
  scope: JudgeScope;
  metadataPath: string;
  worktreePath: string;
  parent?: JudgeSnapshotParent;
}

export interface LoadedJudgeSnapshot extends JudgeSnapshot {
  metadata: JudgeSnapshotMetadata;
  manifest: Map<string, string>;
}

export interface JudgeSnapshotCurrentState {
  snapshotId: string;
  status: "CURRENT" | "NEWER_CHANGES" | "DIVERGED";
  changedFiles: string[];
}

export interface JudgeSnapshotPruneResult {
  dryRun: boolean;
  keep: number;
  kept: string[];
  removed: string[];
}

export interface JudgeSnapshotValidationWorkspace {
  worktreePath: string;
  cleanup: () => Promise<void>;
}

interface CaptureParent extends JudgeSnapshotParent {
  worktreePath: string;
  manifest: Map<string, string>;
}

export function isSnapshotCandidate(candidate: string): boolean {
  return /^SNAPSHOT:[0-9a-f]{20}$/.test(candidate);
}

export async function captureJudgeSnapshot(cwd: string, taskId: string, base: string): Promise<JudgeSnapshot> {
  return capture(cwd, taskId, base);
}

export async function captureJudgeCatchUpSnapshot(
  cwd: string,
  taskId: string,
  parentRecordPath: string,
): Promise<JudgeSnapshot> {
  const absoluteRecord = path.resolve(cwd, parentRecordPath);
  const relativeRecord = path.relative(cwd, absoluteRecord).split(path.sep).join("/");
  if (!relativeRecord || relativeRecord.startsWith("../") || path.isAbsolute(relativeRecord)) {
    throw new Error("The parent review record must be inside the project.");
  }
  const recordBytes = await readFile(absoluteRecord);
  const record = JSON.parse(recordBytes.toString("utf8")) as {
    taskId?: string;
    verdict?: string;
    scope?: JudgeScope;
  };
  if (record.taskId !== taskId || record.verdict !== "APPROVED" || !record.scope) {
    throw new Error("Catch-up requires an APPROVED review record for the same task.");
  }
  if (!isSnapshotCandidate(record.scope.candidate)) {
    throw new Error("Catch-up requires a review whose candidate is an immutable snapshot.");
  }
  const { verifyJudgeRecord } = await import("./judge-enforcement.js");
  const verified = await verifyJudgeRecord(cwd, relativeRecord, { runTests: true });
  if (!verified.approved) {
    throw new Error(`Catch-up requires a verified current snapshot approval: ${verified.reasons.join(" ")}`);
  }
  const loaded = await loadJudgeSnapshot(cwd, record.scope.candidate);
  const parent: CaptureParent = {
    snapshotId: loaded.id,
    scopeDigest: record.scope.scopeDigest,
    recordPath: relativeRecord,
    recordDigest: hash([recordBytes]),
    worktreePath: loaded.worktreePath,
    manifest: loaded.manifest,
  };
  return capture(cwd, taskId, loaded.metadata.sourceScope.baseCommit, parent);
}

export async function loadJudgeSnapshot(cwd: string, candidate: string): Promise<LoadedJudgeSnapshot> {
  return loadJudgeSnapshotInternal(cwd, candidate, new Set());
}

async function loadJudgeSnapshotInternal(
  cwd: string,
  candidate: string,
  ancestors: Set<string>,
): Promise<LoadedJudgeSnapshot> {
  if (!isSnapshotCandidate(candidate)) throw new Error(`Invalid snapshot candidate: ${candidate}`);
  const id = candidate.slice(SNAPSHOT_PREFIX.length);
  if (ancestors.has(id)) throw new Error(`Snapshot integrity check failed: parent snapshot cycle at ${id}.`);
  const nextAncestors = new Set(ancestors).add(id);
  const root = path.join(cwd, SNAPSHOT_ROOT, id);
  const metadataPath = path.join(root, "snapshot.json");
  const worktreePath = path.join(root, "worktree");
  let metadata: JudgeSnapshotMetadata;
  try {
    metadata = JSON.parse(await readFile(metadataPath, "utf8")) as JudgeSnapshotMetadata;
  } catch (error) {
    throw new Error(`Snapshot integrity check failed: ${messageOf(error)}`);
  }
  if (
    metadata.version !== SNAPSHOT_VERSION ||
    metadata.id !== id ||
    metadata.scope.candidate !== candidate ||
    metadata.taskId !== metadata.scope.taskId
  ) {
    throw new Error("Snapshot integrity check failed: metadata shape or identity is invalid.");
  }
  let workspace: Map<string, string>;
  try {
    const dependencyInfo = await lstat(path.join(worktreePath, "node_modules")).catch(() => undefined);
    if (dependencyInfo?.isSymbolicLink()) {
      throw new Error("snapshot dependency directory is a symlink; capture a new isolated snapshot");
    }
    const currentBlockedPatterns = normalizePatterns(await readBlockedPatterns(cwd));
    const snapshotBlockedPatterns = normalizePatterns(await readBlockedPatterns(worktreePath));
    if (JSON.stringify(currentBlockedPatterns) !== JSON.stringify(snapshotBlockedPatterns)) {
      throw new Error("blocked-read policy changed after capture; capture a new snapshot");
    }
    workspace = await workspaceManifest(worktreePath, snapshotBlockedPatterns);
  } catch (error) {
    throw new Error(`Snapshot integrity check failed: ${messageOf(error)}`);
  }
  const workspaceDigest = manifestDigest(workspace);
  if (workspaceDigest !== metadata.workspaceDigest) {
    throw new Error("Snapshot integrity check failed: workspace content no longer matches its capture.");
  }
  if (metadata.parent) {
    const currentParentRecord = await readFile(path.join(cwd, metadata.parent.recordPath)).catch(() => undefined);
    if (!currentParentRecord || hash([currentParentRecord]) !== metadata.parent.recordDigest) {
      throw new Error("Snapshot integrity check failed: parent review record no longer matches the catch-up chain.");
    }
    try {
      const parent = await loadJudgeSnapshotInternal(
        cwd,
        `${SNAPSHOT_PREFIX}${metadata.parent.snapshotId}`,
        nextAncestors,
      );
      if (parent.scope.scopeDigest !== metadata.parent.scopeDigest) {
        throw new Error("parent scope digest no longer matches");
      }
    } catch (error) {
      throw new Error(`Snapshot integrity check failed: parent snapshot is invalid (${messageOf(error)}).`);
    }
  }
  const expectedId = snapshotId(metadata.taskId, metadata.sourceScope, workspaceDigest, metadata.parent);
  if (expectedId !== id || scopeDigest(metadata.scope) !== metadata.scope.scopeDigest) {
    throw new Error("Snapshot integrity check failed: metadata digest no longer matches its capture.");
  }
  return {
    id,
    candidate,
    scope: metadata.scope,
    metadataPath,
    worktreePath,
    parent: metadata.parent,
    metadata,
    manifest: workspace,
  };
}

export async function checkJudgeSnapshotCurrentState(
  cwd: string,
  candidate: string,
): Promise<JudgeSnapshotCurrentState> {
  const snapshot = await loadJudgeSnapshot(cwd, candidate);
  const { createJudgeScope } = await import("./judge-enforcement.js");
  try {
    const current = await createJudgeScope(
      cwd,
      snapshot.metadata.taskId,
      snapshot.metadata.sourceScope.baseCommit,
      "WORKTREE",
    );
    const blockedPatterns = await readBlockedPatterns(snapshot.worktreePath);
    const liveManifest = await workspaceManifest(cwd, blockedPatterns);
    const changedFiles = changedManifestPaths(snapshot.manifest, liveManifest);
    if (sameLiveBoundary(current, snapshot.metadata.sourceScope) && changedFiles.length === 0) {
      return { snapshotId: snapshot.id, status: "CURRENT", changedFiles: [] };
    }
    const ancestor = await gitExitZero(cwd, [
      "merge-base",
      "--is-ancestor",
      snapshot.metadata.sourceScope.candidateCommit,
      "HEAD",
    ]);
    return {
      snapshotId: snapshot.id,
      status: ancestor ? "NEWER_CHANGES" : "DIVERGED",
      changedFiles,
    };
  } catch {
    return { snapshotId: snapshot.id, status: "DIVERGED", changedFiles: [] };
  }
}

export async function checkJudgeReviewCurrentState(
  cwd: string,
  recordPath: string,
): Promise<JudgeSnapshotCurrentState> {
  const { verifyJudgeRecord } = await import("./judge-enforcement.js");
  const verified = await verifyJudgeRecord(cwd, recordPath);
  if (!verified.approved) {
    throw new Error(`Current-state checks require a valid APPROVED snapshot review: ${verified.reasons.join(" ")}`);
  }
  const record = JSON.parse(await readFile(path.resolve(cwd, recordPath), "utf8")) as {
    scope?: { candidate?: string };
  };
  const candidate = record.scope?.candidate;
  if (!candidate || !isSnapshotCandidate(candidate)) {
    throw new Error("Current-state checks require a review record for an immutable snapshot.");
  }
  return checkJudgeSnapshotCurrentState(cwd, candidate);
}

export async function createJudgeSnapshotValidationWorkspace(
  cwd: string,
  candidate: string,
): Promise<JudgeSnapshotValidationWorkspace> {
  const snapshot = await loadJudgeSnapshot(cwd, candidate);
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "akrctx-judge-validation-"));
  const worktreePath = path.join(temporaryRoot, "worktree");
  try {
    await cp(snapshot.worktreePath, worktreePath, {
      recursive: true,
      preserveTimestamps: true,
      mode: constants.COPYFILE_FICLONE,
    });
    return {
      worktreePath,
      cleanup: () => rm(temporaryRoot, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function pruneJudgeSnapshots(
  cwd: string,
  options: { keep: number; dryRun?: boolean },
): Promise<JudgeSnapshotPruneResult> {
  if (!Number.isInteger(options.keep) || options.keep < 0) {
    throw new Error("Snapshot retention --keep must be a non-negative integer.");
  }
  const dryRun = options.dryRun ?? true;
  const snapshotsRoot = path.join(cwd, SNAPSHOT_ROOT);
  const entries = (await readdir(snapshotsRoot, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && /^[0-9a-f]{20}$/.test(entry.name))
    .map((entry) => entry.name);
  const snapshots = await Promise.all(
    entries.map(async (id) => {
      const root = path.join(snapshotsRoot, id);
      const info = await stat(root);
      const metadata = JSON.parse(await readFile(path.join(root, "snapshot.json"), "utf8")) as {
        parent?: { snapshotId?: string };
      };
      return { id, mtimeMs: info.mtimeMs, parentId: metadata.parent?.snapshotId };
    }),
  );
  snapshots.sort((left, right) => right.mtimeMs - left.mtimeMs || left.id.localeCompare(right.id));
  const byId = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));
  const retained = new Set(snapshots.slice(0, options.keep).map((snapshot) => snapshot.id));
  for (const id of [...retained]) {
    let parentId = byId.get(id)?.parentId;
    while (parentId && byId.has(parentId) && !retained.has(parentId)) {
      retained.add(parentId);
      parentId = byId.get(parentId)?.parentId;
    }
  }
  const kept = snapshots.filter((snapshot) => retained.has(snapshot.id)).map((snapshot) => snapshot.id);
  const removed = snapshots.filter((snapshot) => !retained.has(snapshot.id)).map((snapshot) => snapshot.id);
  if (!dryRun) {
    for (const id of removed) await rm(path.join(snapshotsRoot, id), { recursive: true, force: true });
  }
  return { dryRun, keep: options.keep, kept, removed };
}

async function capture(cwd: string, taskId: string, base: string, parent?: CaptureParent): Promise<JudgeSnapshot> {
  const snapshotsRoot = path.join(cwd, SNAPSHOT_ROOT);
  await mkdir(snapshotsRoot, { recursive: true });
  const { createJudgeScope } = await import("./judge-enforcement.js");

  for (let attempt = 1; attempt <= MAX_CAPTURE_ATTEMPTS; attempt += 1) {
    const sourceScope = await createJudgeScope(cwd, taskId, base, "WORKTREE");
    const temporaryRoot = await mkdtemp(path.join(snapshotsRoot, ".capture-"));
    const worktreePath = path.join(temporaryRoot, "worktree");
    try {
      await createPrivateGitWorkspace(cwd, worktreePath, sourceScope.baseCommit, sourceScope.candidateCommit);
      const blockedPatterns = await readBlockedPatterns(cwd);
      await removeBlockedPaths(worktreePath, blockedPatterns);
      await overlayChangedFiles(cwd, worktreePath, sourceScope.changedFiles);
      await copyLocalDependencies(cwd, worktreePath);

      const after = await createJudgeScope(cwd, taskId, sourceScope.baseCommit, "WORKTREE");
      if (!sameLiveBoundary(after, sourceScope)) {
        await rm(temporaryRoot, { recursive: true, force: true });
        continue;
      }

      const snapshotBlockedPatterns = await readBlockedPatterns(worktreePath);
      const manifest = await workspaceManifest(worktreePath, snapshotBlockedPatterns);
      const liveManifest = await workspaceManifest(cwd, snapshotBlockedPatterns);
      const finalSourceScope = await createJudgeScope(cwd, taskId, sourceScope.baseCommit, "WORKTREE");
      if (!sameLiveBoundary(finalSourceScope, sourceScope)) {
        await rm(temporaryRoot, { recursive: true, force: true });
        continue;
      }
      if (manifestDigest(liveManifest) !== manifestDigest(manifest)) {
        throw new Error(
          `Snapshot copy did not match the stable live workspace; retry after file writes settle (${changedManifestPaths(liveManifest, manifest).slice(0, 8).join(", ")}).`,
        );
      }
      const workspaceDigest = manifestDigest(manifest);
      const parentRecord = parent
        ? {
            snapshotId: parent.snapshotId,
            scopeDigest: parent.scopeDigest,
            recordPath: parent.recordPath,
            recordDigest: parent.recordDigest,
          }
        : undefined;
      const id = snapshotId(taskId, sourceScope, workspaceDigest, parentRecord);
      const candidate = `${SNAPSHOT_PREFIX}${id}`;
      const changedFiles = parent ? changedManifestPaths(parent.manifest, manifest) : sourceScope.changedFiles;
      const changeDigest = parent ? deltaDigest(parent.manifest, manifest) : sourceScope.changeDigest;
      const core = {
        ...sourceScope,
        base: parent ? `${SNAPSHOT_PREFIX}${parent.snapshotId}` : sourceScope.baseCommit,
        candidate,
        changedFiles,
        changeDigest,
      };
      const scope: JudgeScope = { ...core, scopeDigest: scopeDigest(core) };
      const metadata: JudgeSnapshotMetadata = {
        version: SNAPSHOT_VERSION,
        id,
        taskId,
        workspaceDigest,
        sourceScope,
        scope,
        parent: parentRecord,
      };
      await writeFile(path.join(temporaryRoot, "snapshot.json"), `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
      const finalRoot = path.join(snapshotsRoot, id);
      try {
        await rename(temporaryRoot, finalRoot);
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== "EEXIST" &&
          (error as NodeJS.ErrnoException).code !== "ENOTEMPTY"
        ) {
          throw error;
        }
        await rm(temporaryRoot, { recursive: true, force: true });
      }
      const loaded = await loadJudgeSnapshot(cwd, candidate);
      return {
        id: loaded.id,
        candidate: loaded.candidate,
        scope: loaded.scope,
        metadataPath: loaded.metadataPath,
        worktreePath: loaded.worktreePath,
        parent: loaded.parent,
      };
    } catch (error) {
      await rm(temporaryRoot, { recursive: true, force: true });
      throw error;
    }
  }
  throw new Error("The workspace kept changing while akrctx captured it. Retry when file writes briefly settle.");
}

async function overlayChangedFiles(sourceRoot: string, snapshotRoot: string, relativePaths: string[]): Promise<void> {
  for (const relativePath of relativePaths) {
    const source = path.join(sourceRoot, relativePath);
    const destination = path.join(snapshotRoot, relativePath);
    const info = await lstat(source).catch(() => undefined);
    if (!info) {
      await rm(destination, { recursive: true, force: true });
      continue;
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await rm(destination, { recursive: true, force: true });
    if (info.isSymbolicLink()) {
      await symlink(await readlink(source), destination);
    } else if (info.isDirectory()) {
      await cp(source, destination, { recursive: true, preserveTimestamps: true });
    } else {
      await copyFile(source, destination);
    }
  }
}

async function createPrivateGitWorkspace(
  sourceRoot: string,
  snapshotRoot: string,
  baseCommit: string,
  candidateCommit: string,
): Promise<void> {
  await mkdir(snapshotRoot, { recursive: true });
  await git(snapshotRoot, ["init", "--quiet"]);
  await git(snapshotRoot, ["remote", "add", "origin", pathToFileURL(sourceRoot).href]);
  await git(snapshotRoot, ["fetch", "--quiet", "--depth=1", "--no-tags", "origin", candidateCommit]);
  await git(snapshotRoot, ["checkout", "--quiet", "--detach", "FETCH_HEAD"]);
  if (baseCommit !== candidateCommit) {
    await git(snapshotRoot, ["fetch", "--quiet", "--depth=1", "--no-tags", "origin", baseCommit]);
  }
  await git(snapshotRoot, ["remote", "remove", "origin"]);
}

async function removeBlockedPaths(snapshotRoot: string, blockedPatterns: string[]): Promise<void> {
  const tracked = await git(snapshotRoot, ["ls-files", "--cached", "-z"]);
  for (const relativePath of tracked.split("\0").filter(Boolean)) {
    if (blockedPatterns.some((pattern) => matchesBlockedPattern(relativePath, pattern))) {
      await rm(path.join(snapshotRoot, relativePath), { recursive: true, force: true });
    }
  }
}

async function copyLocalDependencies(sourceRoot: string, snapshotRoot: string): Promise<void> {
  const source = path.join(sourceRoot, "node_modules");
  const destination = path.join(snapshotRoot, "node_modules");
  if (!(await lstat(source).catch(() => undefined)) || (await lstat(destination).catch(() => undefined))) return;
  await cp(source, destination, {
    recursive: true,
    preserveTimestamps: true,
    dereference: true,
    mode: constants.COPYFILE_FICLONE,
  });
}

async function workspaceManifest(root: string, blockedPatterns: string[]): Promise<Map<string, string>> {
  const raw = await git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]);
  const paths = raw.split("\0").filter(Boolean).sort();
  const manifest = new Map<string, string>();
  for (const relativePath of paths) {
    if (relativePath === "node_modules" && (await lstat(path.join(root, relativePath))).isSymbolicLink()) continue;
    await addManifestPath(root, relativePath, blockedPatterns, manifest);
  }
  return manifest;
}

async function addManifestPath(
  root: string,
  relativePath: string,
  blockedPatterns: string[],
  manifest: Map<string, string>,
): Promise<void> {
  if (blockedPatterns.some((pattern) => matchesBlockedPattern(relativePath, pattern))) return;
  const absolute = path.join(root, relativePath);
  const info = await lstat(absolute).catch(() => undefined);
  if (!info) {
    manifest.set(relativePath, "missing");
  } else if (info.isSymbolicLink()) {
    manifest.set(relativePath, hash(["symlink\0", await readlink(absolute)]));
  } else if (info.isFile()) {
    manifest.set(relativePath, hash([`file:${info.mode & 0o777}\0`, await readFile(absolute)]));
  } else if (info.isDirectory()) {
    const nested = await git(absolute, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).catch(
      () => undefined,
    );
    if (nested === undefined) {
      manifest.set(relativePath, "directory");
      return;
    }
    const nestedPaths = nested.split("\0").filter(Boolean).sort();
    if (nestedPaths.length === 0) manifest.set(relativePath, "empty-git-directory");
    for (const nestedPath of nestedPaths) {
      await addManifestPath(root, path.posix.join(relativePath, nestedPath), blockedPatterns, manifest);
    }
  } else {
    manifest.set(relativePath, `type:${info.mode}`);
  }
}

function manifestDigest(manifest: Map<string, string>): string {
  return hash([...manifest].flatMap(([relativePath, fingerprint]) => [relativePath, "\0", fingerprint, "\0"]));
}

function changedManifestPaths(before: Map<string, string>, after: Map<string, string>): string[] {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter((relativePath) => before.get(relativePath) !== after.get(relativePath))
    .sort();
}

function deltaDigest(before: Map<string, string>, after: Map<string, string>): string {
  return hash(
    changedManifestPaths(before, after).flatMap((relativePath) => [
      relativePath,
      "\0",
      before.get(relativePath) ?? "absent",
      "\0",
      after.get(relativePath) ?? "absent",
      "\0",
    ]),
  );
}

function snapshotId(
  taskId: string,
  sourceScope: JudgeScope,
  workspaceDigest: string,
  parent?: JudgeSnapshotParent,
): string {
  return hash([JSON.stringify({ taskId, sourceScope, workspaceDigest, parent })]).slice("sha256:".length, 27);
}

function scopeDigest(scope: Omit<JudgeScope, "scopeDigest"> | JudgeScope): string {
  const { scopeDigest: _ignored, ...core } = scope as JudgeScope;
  return hash([JSON.stringify(core)]);
}

function sameLiveBoundary(left: JudgeScope, right: JudgeScope): boolean {
  return (
    left.candidateCommit === right.candidateCommit &&
    left.taskDigest === right.taskDigest &&
    left.changeDigest === right.changeDigest &&
    JSON.stringify(left.changedFiles) === JSON.stringify(right.changedFiles) &&
    JSON.stringify(left.excludedPaths) === JSON.stringify(right.excludedPaths)
  );
}

async function readBlockedPatterns(cwd: string): Promise<string[]> {
  const { readBlockedPatterns: read } = await import("./judge-enforcement.js");
  return read(cwd);
}

function matchesBlockedPattern(relativePath: string, pattern: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  const parts = normalized.split("/");
  if (pattern.endsWith("/")) {
    const directory = pattern.slice(0, -1);
    return parts.includes(directory) || normalized.startsWith(pattern);
  }
  if (pattern.startsWith("*.")) return parts.some((part) => part.endsWith(pattern.slice(1)));
  if (pattern.endsWith(".*")) return parts.some((part) => part.startsWith(pattern.slice(0, -1)));
  return parts.includes(pattern) || normalized === pattern;
}

function normalizePatterns(patterns: string[]): string[] {
  return [...new Set(patterns)].sort();
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function gitExitZero(cwd: string, args: string[]): Promise<boolean> {
  try {
    await git(cwd, args);
    return true;
  } catch {
    return false;
  }
}

function hash(parts: Array<string | Buffer>): string {
  const digest = createHash("sha256");
  for (const part of parts) digest.update(part);
  return `sha256:${digest.digest("hex")}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
