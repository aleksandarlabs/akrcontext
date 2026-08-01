import { exec, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { CLI_VERSION } from "./version.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const taskFiles = ["task.md", "context.md", "plan.md", "acceptance-criteria.md", "review-checklist.md"];

/** Schema version for the judge scope and review record. Bumped whenever the approval contract changes. */
export const JUDGE_SCHEMA_VERSION = 2;

export interface JudgeScope {
  schemaVersion: typeof JUDGE_SCHEMA_VERSION;
  cliVersion: string;
  taskId: string;
  base: string;
  candidate: string;
  baseCommit: string;
  candidateCommit: string;
  changedFiles: string[];
  excludedPaths: string[];
  taskDigest: string;
  changeDigest: string;
  scopeDigest: string;
}

export interface JudgeReviewRecord {
  schemaVersion: typeof JUDGE_SCHEMA_VERSION;
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
  /** Commands the capsule declares under `## Validation` in task.md. */
  declaredCommands: string[];
  /** Commands this CLI re-executed itself, with the exit status it observed. */
  reexecuted: Array<{ command: string; passed: boolean }>;
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
  const blockedPatterns = await readBlockedPatterns(cwd);
  const isBlocked = (relativePath: string) =>
    blockedPatterns.some((pattern) => matchesBlockedPattern(relativePath, pattern));

  // Learn which tracked paths moved, then recompute the diff with the blocked ones excluded at the
  // Git level. Filtering after the fact would be too late: the diff body would already carry their
  // content into the digest, and `changedFiles` would invite the judge to read them.
  const allChanged = (await git(cwd, ["diff", "--name-only", "--no-ext-diff", ...boundary, "--"]))
    .split("\n")
    .filter(Boolean);
  const excludedPaths = allChanged.filter(isBlocked);
  const changedFiles = allChanged.filter((file) => !isBlocked(file));
  const exclusions = excludedPaths.map((file) => `:(exclude,literal)${file}`);
  const diff = await git(cwd, ["diff", "--binary", "--no-ext-diff", ...boundary, "--", ...exclusions]);
  const changeParts: Array<string | Buffer> = ["git-diff\0", diff];

  if (worktree) {
    const untrackedRaw = await git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]);
    const untracked = untrackedRaw.split("\0").filter(Boolean).sort();
    for (const relativePath of untracked) {
      if (isBlocked(relativePath)) {
        excludedPaths.push(relativePath);
        continue;
      }
      const absolute = path.join(cwd, relativePath);
      const info = await lstat(absolute);
      const content = info.isSymbolicLink() ? Buffer.from(await readlink(absolute)) : await readFile(absolute);
      changeParts.push("untracked\0", relativePath, "\0", content, "\0");
      changedFiles.push(relativePath);
    }
  }

  // Paths only, never content: the set of withheld files is part of the boundary, so a secret
  // appearing or disappearing still invalidates a stale approval without being fingerprinted.
  const uniqueExcludedPaths = [...new Set(excludedPaths)].sort();
  changeParts.push("excluded\0", uniqueExcludedPaths.join("\0"), "\0");
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
    schemaVersion: JUDGE_SCHEMA_VERSION as typeof JUDGE_SCHEMA_VERSION,
    cliVersion: CLI_VERSION,
    taskId,
    base,
    candidate: worktree ? "WORKTREE" : candidate,
    baseCommit,
    candidateCommit,
    changedFiles: uniqueChangedFiles,
    excludedPaths: uniqueExcludedPaths,
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

export interface JudgeVerifyOptions {
  /** Re-execute the capsule-declared commands the record claims passed, instead of trusting the claim. */
  runTests?: boolean;
}

export async function verifyJudgeRecord(
  cwd: string,
  recordPath: string,
  options: JudgeVerifyOptions = {},
): Promise<JudgeVerifyResult> {
  const empty = { declaredCommands: [] as string[], reexecuted: [] as JudgeVerifyResult["reexecuted"] };
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.resolve(cwd, recordPath), "utf8"));
  } catch (error) {
    return { valid: false, approved: false, reasons: [`Cannot read valid review JSON: ${messageOf(error)}`], ...empty };
  }

  const shapeReasons = validateRecord(raw);
  if (shapeReasons.length > 0) return { valid: false, approved: false, reasons: shapeReasons, ...empty };
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
      ...empty,
    };
  }

  const reasons: string[] = [];
  if (record.taskId !== record.scope.taskId) reasons.push("record.taskId does not match scope.taskId.");
  if (record.scope.cliVersion !== current.cliVersion) {
    const drift = `akrctx v${record.scope.cliVersion}; this CLI is v${current.cliVersion}`;
    reasons.push(`Review was produced by ${drift}. Approval rules differ between versions, so re-run the review.`);
  }
  for (const field of ["baseCommit", "candidateCommit", "taskDigest", "changeDigest", "scopeDigest"] as const) {
    if (record.scope[field] !== current[field]) reasons.push(`scope.${field} no longer matches the repository.`);
  }
  for (const field of ["changedFiles", "excludedPaths"] as const) {
    if (JSON.stringify(record.scope[field]) !== JSON.stringify(current[field])) {
      reasons.push(`scope.${field} no longer matches the repository.`);
    }
  }
  if (record.verdict !== "APPROVED") reasons.push(`Judge verdict is ${record.verdict}, not APPROVED.`);
  if (record.tests.some((test) => test.status === "failed")) {
    reasons.push("Judge record contains failed validation.");
  }

  const declaration = await readValidationDeclaration(cwd, record.taskId);
  const declaredCommands = declaration.commands;
  const claimedPassing = record.tests.filter((test) => test.status === "passed").map((test) => test.command);
  const declaredAndPassing = claimedPassing.filter((command) => declaredCommands.includes(command));

  if (record.verdict === "APPROVED") {
    if (claimedPassing.length === 0) {
      reasons.push("APPROVED requires at least one validation command that passed.");
    } else if (declaredCommands.length > 0 && declaredAndPassing.length === 0) {
      const declared = declaredCommands.join(", ");
      reasons.push(`APPROVED requires a passing run of a command the task capsule declares: ${declared}.`);
    } else if (declaration.sectionPresent && declaredCommands.length === 0) {
      // The capsule was generated with a `## Validation` section, so the commands were meant to be
      // filled in. An empty or malformed block is an unfinished capsule, not a legacy one.
      reasons.push("The task capsule has an empty or malformed `## Validation` block; declare the commands.");
    }
    if (record.issues.length > 0) reasons.push("APPROVED records must not list unresolved issues.");
  }

  // Only commands the capsule declares are ever executed, so a review record cannot get an
  // arbitrary string run. This narrows the trust boundary rather than removing it: task.md is
  // project content that an agent normally writes, so `--run-tests` moves the trust from the
  // record to the capsule. See the trust section in docs/JUDGE.md.
  const reexecuted: JudgeVerifyResult["reexecuted"] = [];
  if (options.runTests) {
    if (declaredAndPassing.length === 0) {
      reasons.push("--run-tests found no capsule-declared command claimed as passing to re-execute.");
    }
    for (const command of [...new Set(declaredAndPassing)]) {
      const passed = await runValidationCommand(cwd, command);
      reexecuted.push({ command, passed });
      if (!passed) reasons.push(`Independent re-run of \`${command}\` failed; the record claims it passed.`);
    }
    // Validation can mutate the worktree — formatters, snapshot updates, codegen all exit 0 and
    // leave the repository outside the boundary that was reviewed. Approving that would approve
    // code no judge ever saw, so the boundary is recomputed after every command has run.
    if (reexecuted.length > 0) {
      const drifted = await boundaryDrift(cwd, record, current);
      if (drifted.length > 0) {
        reasons.push(
          `Validation changed the repository: ${drifted.join(", ")} no longer match the boundary that was reviewed.`,
        );
      }
    }
  }

  return {
    valid: reasons.length === 0,
    approved: reasons.length === 0 && record.verdict === "APPROVED",
    verdict: record.verdict,
    scopeDigest: record.scope.scopeDigest,
    reasons,
    declaredCommands,
    reexecuted,
  };
}

/**
 * Recompute the boundary and report which fields moved. Used after `--run-tests`, because a
 * validation command that exits 0 can still have rewritten the worktree.
 */
async function boundaryDrift(cwd: string, record: JudgeReviewRecord, before: JudgeScope): Promise<string[]> {
  let after: JudgeScope;
  try {
    after = await createJudgeScope(cwd, record.taskId, record.scope.base, record.scope.candidate);
  } catch (error) {
    return [`the boundary could not be recomputed (${messageOf(error)})`];
  }
  const drifted: string[] = [];
  for (const field of ["taskDigest", "changeDigest", "scopeDigest"] as const) {
    if (before[field] !== after[field]) drifted.push(`scope.${field}`);
  }
  for (const field of ["changedFiles", "excludedPaths"] as const) {
    if (JSON.stringify(before[field]) !== JSON.stringify(after[field])) drifted.push(`scope.${field}`);
  }
  return drifted;
}

export interface ValidationDeclaration {
  /** Whether the capsule has a `## Validation` section at all. Absent means a pre-v2 capsule. */
  sectionPresent: boolean;
  commands: string[];
}

/**
 * Commands listed in the fenced block under `## Validation` in the capsule's task.md.
 *
 * `sectionPresent` distinguishes a legacy capsule that predates the section, which falls back to
 * the weaker "any passing command" rule, from a current capsule whose block was left empty or
 * malformed — that one is an unfinished capsule and must not silently weaken the gate.
 */
export async function readValidationDeclaration(cwd: string, taskId: string): Promise<ValidationDeclaration> {
  const absent = { sectionPresent: false, commands: [] };
  let taskMarkdown: string;
  try {
    taskMarkdown = await readFile(path.join(await resolveTaskRoot(cwd, taskId), "task.md"), "utf8");
  } catch {
    return absent;
  }
  const section = /\n##\s+Validation\s*\n([\s\S]*?)(?=\n##\s|$)/.exec(taskMarkdown);
  if (!section) return absent;
  const fence = /```[^\n]*\n([\s\S]*?)```/.exec(section[1]);
  if (!fence) return { sectionPresent: true, commands: [] };
  const commands = [
    ...new Set(
      fence[1]
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#")),
    ),
  ];
  return { sectionPresent: true, commands };
}

async function runValidationCommand(cwd: string, command: string): Promise<boolean> {
  try {
    await execAsync(command, { cwd, timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

function validateRecord(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Review record must be a JSON object."];
  const record = value as Record<string, unknown>;
  const reasons: string[] = [];
  const allowed = ["schemaVersion", "taskId", "scope", "verdict", "tests", "issues", "reviewedAt"];
  for (const key of Object.keys(record)) if (!allowed.includes(key)) reasons.push(`Unexpected review field: ${key}.`);
  if (record.schemaVersion !== JUDGE_SCHEMA_VERSION) reasons.push(`schemaVersion must be ${JUDGE_SCHEMA_VERSION}.`);
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
    "cliVersion",
    "taskId",
    "base",
    "candidate",
    "baseCommit",
    "candidateCommit",
    "changedFiles",
    "excludedPaths",
    "taskDigest",
    "changeDigest",
    "scopeDigest",
  ];
  if (Object.keys(scope).some((key) => !keys.includes(key)) || keys.some((key) => !(key in scope))) return false;
  const digestPattern = /^sha256:[0-9a-f]{64}$/;
  const commitPattern = /^[0-9a-f]{40,64}$/;
  return (
    scope.schemaVersion === JUDGE_SCHEMA_VERSION &&
    typeof scope.cliVersion === "string" &&
    scope.cliVersion.length > 0 &&
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
    Array.isArray(scope.excludedPaths) &&
    scope.excludedPaths.every((item) => typeof item === "string") &&
    new Set(scope.excludedPaths).size === scope.excludedPaths.length &&
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

/**
 * Fail closed. These patterns are what keeps secrets out of the diff and out of the digest, so a
 * policy that cannot be read is a reason to refuse to compute a boundary — not a reason to fall
 * back to a weaker default set and carry on as if the exclusion still held.
 */
async function readBlockedPatterns(cwd: string): Promise<string[]> {
  const unusable = (why: string) =>
    new Error(`Cannot apply policy.json blockedReadPatterns (${why}). Run \`akrctx doctor --fix\` first.`);
  let policy: unknown;
  try {
    policy = JSON.parse(await readFile(path.join(cwd, ".akrctx/policy.json"), "utf8"));
  } catch (error) {
    throw unusable(messageOf(error));
  }
  const patterns = (policy as { blockedReadPatterns?: unknown } | null)?.blockedReadPatterns;
  if (!Array.isArray(patterns)) throw unusable("blockedReadPatterns is missing or not an array");
  if (!patterns.every((value): value is string => typeof value === "string" && value.length > 0)) {
    throw unusable("blockedReadPatterns contains a non-string or empty entry");
  }
  return patterns;
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
