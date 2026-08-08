import { exec, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { capsuleFiles } from "./harness-files.js";
import { CLI_VERSION } from "./version.js";

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

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
  independent?: boolean;
}

export interface JudgeVerifyResult {
  valid: boolean;
  approved: boolean;
  verdict?: JudgeReviewRecord["verdict"];
  scopeDigest?: string;
  reasons: string[];
  notices: string[];
  declaredCommands: string[];
  reexecuted: Array<{ command: string; passed: boolean }>;
}

export async function createJudgeScope(
  cwd: string,
  taskId: string,
  base: string,
  candidate = "WORKTREE",
): Promise<JudgeScope> {
  requireTaskId(taskId);
  const { isSnapshotCandidate, loadJudgeSnapshot } = await import("./judge-snapshot.js");
  if (isSnapshotCandidate(candidate)) {
    const snapshot = await loadJudgeSnapshot(cwd, candidate);
    if (snapshot.scope.taskId !== taskId) {
      throw new Error(`Snapshot ${snapshot.id} belongs to ${snapshot.scope.taskId}, not ${taskId}.`);
    }
    return snapshot.scope;
  }
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

  const uniqueExcludedPaths = [...new Set(excludedPaths)].sort();
  changeParts.push("excluded\0", uniqueExcludedPaths.join("\0"), "\0");
  const uniqueChangedFiles = [...new Set(changedFiles)].sort();
  const taskRoot = await resolveTaskRoot(cwd, taskId);
  const taskParts: Array<string | Buffer> = [];
  for (const fileName of capsuleFiles) {
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
  const empty = {
    notices: [] as string[],
    declaredCommands: [] as string[],
    reexecuted: [] as JudgeVerifyResult["reexecuted"],
  };
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.resolve(cwd, recordPath), "utf8"));
  } catch (error) {
    return { valid: false, approved: false, reasons: [`Cannot read valid review JSON: ${messageOf(error)}`], ...empty };
  }

  const shapeReasons = validateRecord(raw);
  if (shapeReasons.length > 0) return { valid: false, approved: false, reasons: shapeReasons, ...empty };
  const record = raw as JudgeReviewRecord;
  const { createJudgeSnapshotValidationWorkspace, isSnapshotCandidate, loadJudgeSnapshot } = await import(
    "./judge-snapshot.js"
  );
  const snapshot = isSnapshotCandidate(record.scope.candidate)
    ? await loadJudgeSnapshot(cwd, record.scope.candidate).catch(() => undefined)
    : undefined;
  const reviewCwd = snapshot?.worktreePath ?? cwd;
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

  const declaration = await readValidationDeclaration(reviewCwd, record.taskId);
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

  const reexecuted: JudgeVerifyResult["reexecuted"] = [];
  if (options.runTests) {
    if (declaredAndPassing.length === 0) {
      reasons.push("--run-tests found no capsule-declared command claimed as passing to re-execute.");
    }
    let validationCwd = reviewCwd;
    let cleanup: (() => Promise<void>) | undefined;
    try {
      if (snapshot) {
        const validationWorkspace = await createJudgeSnapshotValidationWorkspace(cwd, record.scope.candidate);
        validationCwd = validationWorkspace.worktreePath;
        cleanup = validationWorkspace.cleanup;
      }
      for (const command of [...new Set(declaredAndPassing)]) {
        const passed = await runValidationCommand(validationCwd, command);
        reexecuted.push({ command, passed });
        if (!passed) reasons.push(`Independent re-run of \`${command}\` failed; the record claims it passed.`);
      }
      if (reexecuted.length > 0) {
        const drifted = snapshot
          ? await snapshotValidationDrift(validationCwd, snapshot.metadata.sourceScope)
          : await boundaryDrift(cwd, record, current);
        if (drifted.length > 0) {
          reasons.push(
            snapshot
              ? `Validation changed the snapshot boundary in its disposable workspace: ${drifted.join(", ")} no longer match the reviewed boundary.`
              : `Validation changed the repository: ${drifted.join(", ")} no longer match the boundary that was reviewed.`,
          );
        }
      }
    } catch (error) {
      reasons.push(`Cannot create or inspect the validation workspace: ${messageOf(error)}`);
    } finally {
      await cleanup?.();
    }
  }

  // Reported, never enforced: see the `notices` field on JudgeVerifyResult.
  const notices: string[] = [];
  if (record.independent === false) {
    notices.push(
      "Review was marked non-independent (independent: false). The verdict is verification-only: " +
        "the boundary and validation were checked, but the judgment was not made by an independent " +
        "reviewer. The comprehension gate will not accept it; run the judge from another host or a " +
        "separate session for an independent verdict.",
    );
  }
  const clarification = await readClarificationState(reviewCwd, record.taskId);
  const open = clarification.openQuestions.length;
  if (open > 0) {
    notices.push(
      `The task capsule lists ${open} unresolved open question${open === 1 ? "" : "s"}; ` +
        `confirm ${open === 1 ? "it" : "they"} would not have changed the implementation.`,
    );
  }

  return {
    valid: reasons.length === 0,
    approved: reasons.length === 0 && record.verdict === "APPROVED",
    verdict: record.verdict,
    scopeDigest: record.scope.scopeDigest,
    reasons,
    notices,
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
  return scopeDrift(before, after);
}

async function snapshotValidationDrift(cwd: string, before: JudgeScope): Promise<string[]> {
  let after: JudgeScope;
  try {
    after = await createJudgeScope(cwd, before.taskId, before.base, "WORKTREE");
  } catch (error) {
    return [`the boundary could not be recomputed (${messageOf(error)})`];
  }
  return scopeDrift(before, after);
}

function scopeDrift(before: JudgeScope, after: JudgeScope): string[] {
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

export interface ClarificationState {
  /**
   * Whether task.md has a `## Clarifications` section. Absent means a capsule written
   * before the clarification step existed, not an unfinished one — same distinction
   * `ValidationDeclaration.sectionPresent` draws for pre-v2 capsules.
   */
  clarificationsSectionPresent: boolean;
  clarifications: string[];
  openQuestions: string[];
}

/** The bullet both sections ship with; every consumer reads it as "empty". */
const CLARIFICATION_PLACEHOLDER = "None recorded yet.";

/**
 * Bullets under `## Clarifications` and `## Open Questions` in the capsule's task.md.
 *
 * Both sections open with explanatory prose before the bullets, so only lines that are
 * bullets are collected; the prose is instruction for the agent, not content.
 */
export async function readClarificationState(cwd: string, taskId: string): Promise<ClarificationState> {
  const absent: ClarificationState = { clarificationsSectionPresent: false, clarifications: [], openQuestions: [] };
  let taskMarkdown: string;
  try {
    taskMarkdown = await readFile(path.join(await resolveTaskRoot(cwd, taskId), "task.md"), "utf8");
  } catch {
    return absent;
  }
  const clarifications = sectionBody(taskMarkdown, "Clarifications");
  return {
    clarificationsSectionPresent: clarifications !== undefined,
    clarifications: sectionBullets(clarifications),
    openQuestions: sectionBullets(sectionBody(taskMarkdown, "Open Questions")),
  };
}

/**
 * Body of a level-2 section, up to the next level-2 heading.
 *
 * The lookahead requires whitespace after `##`, so a `### Session YYYY-MM-DD` heading
 * inside `## Clarifications` does not terminate the section.
 */
function sectionBody(markdown: string, heading: string): string | undefined {
  const match = new RegExp(`\\n##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`).exec(markdown);
  return match ? match[1] : undefined;
}

function sectionBullets(body: string | undefined): string[] {
  if (body === undefined) return [];
  const entries: string[] = [];
  for (const line of body.split("\n")) {
    const bullet = /^-\s+(.*)$/.exec(line);
    if (bullet) {
      entries.push(bullet[1].trim());
      continue;
    }
    // Capsule prose wraps at ~100 columns, so an indented line continues the bullet above
    // it. Unindented prose belongs to the section's explanatory paragraph and is dropped.
    if (entries.length > 0 && /^\s+\S/.test(line)) {
      entries[entries.length - 1] = `${entries[entries.length - 1]} ${line.trim()}`;
    }
  }
  return entries.filter((entry) => entry !== CLARIFICATION_PLACEHOLDER);
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
  const allowed = ["schemaVersion", "taskId", "scope", "verdict", "tests", "issues", "reviewedAt", "independent"];
  for (const key of Object.keys(record)) if (!allowed.includes(key)) reasons.push(`Unexpected review field: ${key}.`);
  if (record.schemaVersion !== JUDGE_SCHEMA_VERSION) reasons.push(`schemaVersion must be ${JUDGE_SCHEMA_VERSION}.`);
  if (typeof record.taskId !== "string" || !/^TASK-[0-9]+$/.test(record.taskId)) reasons.push("taskId is invalid.");
  if (!(["APPROVED", "NEEDS_CHANGES", "BLOCKED"] as unknown[]).includes(record.verdict))
    reasons.push("verdict is invalid.");
  if (!Array.isArray(record.issues) || !record.issues.every((item) => typeof item === "string"))
    reasons.push("issues must be a string array.");
  if (record.independent !== undefined && typeof record.independent !== "boolean")
    reasons.push("independent must be a boolean when present.");
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
export async function readBlockedPatterns(cwd: string): Promise<string[]> {
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

export function matchesBlockedPattern(relativePath: string, pattern: string): boolean {
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
