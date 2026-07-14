import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const taskFiles = ["task.md", "context.md", "plan.md", "acceptance-criteria.md", "review-checklist.md"];

export interface JudgeScope {
  schemaVersion: 1;
  taskId: string;
  base: string;
  candidate: string;
  baseCommit: string;
  candidateCommit: string;
  changedFiles: string[];
  taskDigest: string;
  changeDigest: string;
  scopeDigest: string;
}

export interface JudgeReviewRecord {
  schemaVersion: 1;
  taskId: string;
  scope: JudgeScope;
  verdict: "APPROVED" | "NEEDS_CHANGES" | "BLOCKED";
  tests: Array<{ command: string; status: "passed" | "failed" | "not-run"; evidence?: string }>;
  issues: string[];
  reviewedAt: string;
}

export interface JudgeVerifyResult {
  valid: boolean;
  approved: boolean;
  verdict?: JudgeReviewRecord["verdict"];
  scopeDigest?: string;
  reasons: string[];
}

export async function createJudgeScope(
  cwd: string,
  taskId: string,
  base: string,
  candidate = "WORKTREE",
): Promise<JudgeScope> {
  requireTaskId(taskId);
  if (!base.trim()) throw new Error("A non-empty --base Git ref is required.");
  const baseCommit = await resolveCommit(cwd, base);
  const worktree = candidate.toUpperCase() === "WORKTREE";
  const candidateCommit = await resolveCommit(cwd, worktree ? "HEAD" : candidate);
  const boundary = worktree ? [baseCommit] : [baseCommit, candidateCommit];
  const diff = await git(cwd, ["diff", "--binary", "--no-ext-diff", ...boundary, "--"]);
  const changed = await git(cwd, ["diff", "--name-only", "--no-ext-diff", ...boundary, "--"]);
  const changedFiles = changed.split("\n").filter(Boolean);
  const changeParts: Array<string | Buffer> = ["git-diff\0", diff];

  if (worktree) {
    const untrackedRaw = await git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]);
    const untracked = untrackedRaw.split("\0").filter(Boolean).sort();
    const blockedPatterns = await readBlockedPatterns(cwd);
    for (const relativePath of untracked) {
      if (blockedPatterns.some((pattern) => matchesBlockedPattern(relativePath, pattern))) {
        throw new Error(`Cannot fingerprint untracked path blocked by policy: ${relativePath}`);
      }
      const absolute = path.join(cwd, relativePath);
      const info = await lstat(absolute);
      const content = info.isSymbolicLink() ? Buffer.from(await readlink(absolute)) : await readFile(absolute);
      changeParts.push("untracked\0", relativePath, "\0", content, "\0");
    }
    changedFiles.push(...untracked);
  }

  const uniqueChangedFiles = [...new Set(changedFiles)].sort();
  const taskRoot = await resolveTaskRoot(cwd, taskId);
  const taskParts: Array<string | Buffer> = [];
  for (const fileName of taskFiles) {
    const absolute = path.join(taskRoot, fileName);
    let content: Buffer;
    try {
      content = await readFile(absolute);
    } catch {
      throw new Error(`Task capsule file is missing: .akrctx/tasks/${taskId}/${fileName}`);
    }
    taskParts.push(fileName, "\0", content, "\0");
  }

  const taskDigest = digest(taskParts);
  const changeDigest = digest(changeParts);
  const scopeCore = {
    schemaVersion: 1 as const,
    taskId,
    base,
    candidate: worktree ? "WORKTREE" : candidate,
    baseCommit,
    candidateCommit,
    changedFiles: uniqueChangedFiles,
    taskDigest,
    changeDigest,
  };
  const scopeDigest = digest([JSON.stringify(scopeCore)]);
  return { ...scopeCore, scopeDigest };
}

async function resolveTaskRoot(cwd: string, taskId: string): Promise<string> {
  const tasksRoot = path.join(cwd, ".akrctx", "tasks");
  const matches = (await readdir(tasksRoot, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory() && (entry.name === taskId || entry.name.startsWith(`${taskId}-`)))
    .map((entry) => entry.name);
  if (matches.length !== 1)
    throw new Error(`Expected exactly one task capsule for ${taskId}; found ${matches.length}.`);
  return path.join(tasksRoot, matches[0]);
}

export async function verifyJudgeRecord(cwd: string, recordPath: string): Promise<JudgeVerifyResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.resolve(cwd, recordPath), "utf8"));
  } catch (error) {
    return { valid: false, approved: false, reasons: [`Cannot read valid review JSON: ${messageOf(error)}`] };
  }

  const shapeReasons = validateRecord(raw);
  if (shapeReasons.length > 0) return { valid: false, approved: false, reasons: shapeReasons };
  const record = raw as JudgeReviewRecord;
  let current: JudgeScope;
  try {
    current = await createJudgeScope(cwd, record.taskId, record.scope.base, record.scope.candidate);
  } catch (error) {
    return {
      valid: false,
      approved: false,
      verdict: record.verdict,
      scopeDigest: record.scope.scopeDigest,
      reasons: [`Cannot recompute review scope: ${messageOf(error)}`],
    };
  }

  const reasons: string[] = [];
  if (record.taskId !== record.scope.taskId) reasons.push("record.taskId does not match scope.taskId.");
  for (const field of ["baseCommit", "candidateCommit", "taskDigest", "changeDigest", "scopeDigest"] as const) {
    if (record.scope[field] !== current[field]) reasons.push(`scope.${field} no longer matches the repository.`);
  }
  if (JSON.stringify(record.scope.changedFiles) !== JSON.stringify(current.changedFiles)) {
    reasons.push("scope.changedFiles no longer matches the repository.");
  }
  if (record.verdict !== "APPROVED") reasons.push(`Judge verdict is ${record.verdict}, not APPROVED.`);
  if (record.tests.some((test) => test.status === "failed")) {
    reasons.push("Judge record contains failed validation.");
  }

  return {
    valid: reasons.length === 0,
    approved: reasons.length === 0 && record.verdict === "APPROVED",
    verdict: record.verdict,
    scopeDigest: record.scope.scopeDigest,
    reasons,
  };
}

function validateRecord(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Review record must be a JSON object."];
  const record = value as Record<string, unknown>;
  const reasons: string[] = [];
  const allowed = ["schemaVersion", "taskId", "scope", "verdict", "tests", "issues", "reviewedAt"];
  for (const key of Object.keys(record)) if (!allowed.includes(key)) reasons.push(`Unexpected review field: ${key}.`);
  if (record.schemaVersion !== 1) reasons.push("schemaVersion must be 1.");
  if (typeof record.taskId !== "string" || !/^TASK-[0-9]+$/.test(record.taskId)) reasons.push("taskId is invalid.");
  if (!(["APPROVED", "NEEDS_CHANGES", "BLOCKED"] as unknown[]).includes(record.verdict))
    reasons.push("verdict is invalid.");
  if (!Array.isArray(record.issues) || !record.issues.every((item) => typeof item === "string"))
    reasons.push("issues must be a string array.");
  if (!Array.isArray(record.tests) || !record.tests.every(isTestRecord))
    reasons.push("tests contains an invalid entry.");
  if (typeof record.reviewedAt !== "string" || Number.isNaN(Date.parse(record.reviewedAt)))
    reasons.push("reviewedAt must be an ISO date-time.");
  if (!isScope(record.scope)) reasons.push("scope does not match the judge scope contract.");
  return reasons;
}

function isScope(value: unknown): value is JudgeScope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const scope = value as Record<string, unknown>;
  const keys = [
    "schemaVersion",
    "taskId",
    "base",
    "candidate",
    "baseCommit",
    "candidateCommit",
    "changedFiles",
    "taskDigest",
    "changeDigest",
    "scopeDigest",
  ];
  if (Object.keys(scope).some((key) => !keys.includes(key)) || keys.some((key) => !(key in scope))) return false;
  const digestPattern = /^sha256:[0-9a-f]{64}$/;
  const commitPattern = /^[0-9a-f]{40,64}$/;
  return (
    scope.schemaVersion === 1 &&
    typeof scope.taskId === "string" &&
    /^TASK-[0-9]+$/.test(scope.taskId) &&
    typeof scope.base === "string" &&
    scope.base.length > 0 &&
    typeof scope.candidate === "string" &&
    scope.candidate.length > 0 &&
    typeof scope.baseCommit === "string" &&
    commitPattern.test(scope.baseCommit) &&
    typeof scope.candidateCommit === "string" &&
    commitPattern.test(scope.candidateCommit) &&
    Array.isArray(scope.changedFiles) &&
    scope.changedFiles.every((item) => typeof item === "string") &&
    new Set(scope.changedFiles).size === scope.changedFiles.length &&
    typeof scope.taskDigest === "string" &&
    digestPattern.test(scope.taskDigest) &&
    typeof scope.changeDigest === "string" &&
    digestPattern.test(scope.changeDigest) &&
    typeof scope.scopeDigest === "string" &&
    digestPattern.test(scope.scopeDigest)
  );
}

function isTestRecord(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const test = value as Record<string, unknown>;
  return (
    Object.keys(test).every((key) => ["command", "status", "evidence"].includes(key)) &&
    typeof test.command === "string" &&
    test.command.length > 0 &&
    ["passed", "failed", "not-run"].includes(String(test.status)) &&
    (test.evidence === undefined || typeof test.evidence === "string")
  );
}

async function resolveCommit(cwd: string, ref: string): Promise<string> {
  try {
    return (await git(cwd, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`])).trim();
  } catch {
    throw new Error(`Cannot resolve Git commit: ${ref}`);
  }
}

async function readBlockedPatterns(cwd: string): Promise<string[]> {
  try {
    const policy = JSON.parse(await readFile(path.join(cwd, ".akrctx/policy.json"), "utf8"));
    return Array.isArray(policy.blockedReadPatterns)
      ? policy.blockedReadPatterns.filter((value: unknown): value is string => typeof value === "string")
      : [];
  } catch {
    return [".env", ".env.*", "*.pem", "*.key", "*.p12", "*.pfx", "secrets/", "credentials/", "private/"];
  }
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

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  return stdout;
}

function digest(parts: Array<string | Buffer>): string {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return `sha256:${hash.digest("hex")}`;
}

function requireTaskId(taskId: string): void {
  if (!/^TASK-[0-9]+$/.test(taskId)) throw new Error(`Invalid task ID: ${taskId}`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
