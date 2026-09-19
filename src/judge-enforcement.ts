import { exec, execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, readlink } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { capsuleFiles } from "./harness-files.js";
import { measureJudgePhase } from "./judge-timings.js";
import {
  type ValidationFailureEvidence,
  captureValidationError,
  sanitizeValidationCommand,
} from "./validation-evidence.js";
import { CLI_VERSION } from "./version.js";

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);

/** Schema version for the judge scope and review record. Bumped whenever the approval contract changes. */
export const JUDGE_SCHEMA_VERSION = 5;

export interface JudgeScope {
  schemaVersion: typeof JUDGE_SCHEMA_VERSION;
  cliVersion: string;
  taskId: string;
  base: string;
  /** The operator-supplied spelling, retained for diagnostics only. */
  baseRef?: string;
  candidate: string;
  baseCommit: string;
  candidateCommit: string;
  changedFiles: string[];
  /** True only when an intentionally empty snapshot was captured with --allow-empty. */
  emptyBoundaryAuthorized: boolean;
  excludedPaths: string[];
  includedTaskIds: string[];
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
  reexecuted: Array<{ command: string; passed: boolean; evidence?: ValidationFailureEvidence }>;
  /** What the judge declared at review time. Never re-derived, only reported. */
  historicalVerdict: {
    value: JudgeReviewRecord["verdict"] | null;
    independence: "declared-true" | "declared-false" | "unknown";
    scopeDigest: string | null;
    codeReviewContentDigest: string | null;
  };
  /** Whether the declared validation is verified against the current boundary, as of this call. */
  verifiedNow: {
    value: "complete" | "incomplete" | "unknown" | "not-applicable-to-runtime";
    reason: string;
    reviewBoundary: "CURRENT" | "NEWER_CHANGES" | "DIVERGED" | null;
    executionMetadata: "ABSENT" | "UNCHANGED" | "CREATED" | "REMOVED" | "ADVANCED" | null;
  };
}

const emptyHistoricalVerdict: JudgeVerifyResult["historicalVerdict"] = {
  value: null,
  independence: "unknown",
  scopeDigest: null,
  codeReviewContentDigest: null,
};

function unknownVerifiedNow(reason: string): JudgeVerifyResult["verifiedNow"] {
  return { value: "unknown", reason, reviewBoundary: null, executionMetadata: null };
}

export async function createJudgeScope(
  cwd: string,
  taskId: string,
  base: string,
  candidate = "WORKTREE",
  includedTaskIds: string[] = [],
): Promise<JudgeScope> {
  requireTaskId(taskId);
  const requestedTaskIds = [...new Set(includedTaskIds)].sort();
  for (const includedTaskId of requestedTaskIds) requireTaskId(includedTaskId);
  const { isSnapshotCandidate, loadJudgeSnapshot } = await import("./judge-snapshot.js");
  if (isSnapshotCandidate(candidate)) {
    const snapshot = await loadJudgeSnapshot(cwd, candidate);
    if (snapshot.scope.taskId !== taskId) {
      throw new Error(`Snapshot ${snapshot.id} belongs to ${snapshot.scope.taskId}, not ${taskId}.`);
    }
    if (JSON.stringify(requestedTaskIds) !== JSON.stringify(snapshot.scope.includedTaskIds)) {
      throw new Error(`Snapshot ${snapshot.id} was captured with a different --include-task scope.`);
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
  const foreignTaskPaths = uniqueChangedFiles.filter((file) => {
    const match = /^\.akrctx\/tasks\/(TASK-[0-9]+)-[^/]+(?:\/|$)/.exec(file);
    return match && match[1] !== taskId && !requestedTaskIds.includes(match[1]);
  });
  if (foreignTaskPaths.length > 0) {
    const foreignTaskIds = [
      ...new Set(foreignTaskPaths.map((file) => /^\.akrctx\/tasks\/(TASK-[0-9]+)-/.exec(file)?.[1])),
    ]
      .filter((value): value is string => Boolean(value))
      .sort();
    throw new Error(
      `Judge scope for ${taskId} contains foreign task capsule changes from ${foreignTaskIds.join(", ")}: ${foreignTaskPaths.join(", ")}. Isolate the worktree or retry with --include-task ${foreignTaskIds.map((id) => `${id}`).join(" --include-task ")}.`,
    );
  }
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
    base: baseCommit,
    ...(base !== baseCommit ? { baseRef: base } : {}),
    candidate: worktree ? "WORKTREE" : candidate,
    baseCommit,
    candidateCommit,
    changedFiles: uniqueChangedFiles,
    emptyBoundaryAuthorized: false,
    excludedPaths: uniqueExcludedPaths,
    includedTaskIds: requestedTaskIds,
    taskDigest,
    changeDigest,
  };
  const scopeDigest = digest([JSON.stringify(identityScope(scopeCore))]);
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
  approve?: (commands: string[]) => Promise<boolean>;
}

/** Exported so the CLI refuses in the same words the result reports. */
export const SNAPSHOT_REQUIRED_REASON =
  "--run-tests requires a snapshot candidate; capture one with `akrctx judge snapshot <TASK-ID>` and verify that record.";

export function withheldReason(commands: string[]): string {
  return `Operator approval was not given for the declared commands: ${commands.join(", ")}.`;
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
    const reason = `Cannot read valid review JSON: ${messageOf(error)}`;
    return {
      valid: false,
      approved: false,
      reasons: [reason],
      ...empty,
      historicalVerdict: emptyHistoricalVerdict,
      verifiedNow: unknownVerifiedNow(reason),
    };
  }

  const shapeReasons = validateRecord(raw);
  if (shapeReasons.length > 0) {
    return {
      valid: false,
      approved: false,
      reasons: shapeReasons,
      ...empty,
      historicalVerdict: emptyHistoricalVerdict,
      verifiedNow: unknownVerifiedNow(shapeReasons[0]),
    };
  }
  const record = raw as JudgeReviewRecord;
  const recordIndependence: JudgeVerifyResult["historicalVerdict"]["independence"] =
    record.independent === true ? "declared-true" : record.independent === false ? "declared-false" : "unknown";
  const {
    createJudgeSnapshotValidationWorkspace,
    checkJudgeSnapshotCurrentState,
    isSnapshotCandidate,
    loadJudgeSnapshot,
  } = await import("./judge-snapshot.js");
  const snapshot = isSnapshotCandidate(record.scope.candidate)
    ? await loadJudgeSnapshot(cwd, record.scope.candidate).catch(() => undefined)
    : undefined;
  const reviewCwd = snapshot?.worktreePath ?? cwd;
  let current: JudgeScope;
  try {
    current = await createJudgeScope(
      cwd,
      record.taskId,
      record.scope.baseCommit,
      record.scope.candidate,
      record.scope.includedTaskIds,
    );
  } catch (error) {
    const reason = `Cannot recompute review scope: ${messageOf(error)}`;
    return {
      valid: false,
      approved: false,
      verdict: record.verdict,
      scopeDigest: record.scope.scopeDigest,
      reasons: [reason],
      ...empty,
      historicalVerdict: {
        value: record.verdict,
        independence: recordIndependence,
        scopeDigest: record.scope.scopeDigest,
        codeReviewContentDigest: snapshot?.metadata.reviewContentDigest ?? null,
      },
      verifiedNow: unknownVerifiedNow(reason),
    };
  }

  let reviewBoundary: JudgeVerifyResult["verifiedNow"]["reviewBoundary"] = null;
  let executionMetadata: JudgeVerifyResult["verifiedNow"]["executionMetadata"] = null;
  if (isSnapshotCandidate(record.scope.candidate)) {
    try {
      const state = await checkJudgeSnapshotCurrentState(cwd, record.scope.candidate);
      reviewBoundary = state.reviewBoundary;
      executionMetadata = state.executionMetadata;
    } catch {
      // Leave both null; a load failure here is already reflected upstream in `current`'s recompute.
    }
  }

  const reasons: string[] = [];
  const notices: string[] = [];
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
  if (JSON.stringify(record.scope.includedTaskIds) !== JSON.stringify(current.includedTaskIds)) {
    reasons.push("scope.includedTaskIds no longer matches the reviewed snapshot.");
  }
  if (record.verdict !== "APPROVED") reasons.push(`Judge verdict is ${record.verdict}, not APPROVED.`);

  const declaration = await readValidationDeclaration(reviewCwd, record.taskId);
  const declaredCommands = declaration.commands;
  const requiredCommands = declaration.checks.filter((check) => check.required).map((check) => check.command);
  const optionalCommands = declaration.checks.filter((check) => !check.required).map((check) => check.command);
  const claimedPassing = record.tests.filter((test) => test.status === "passed").map((test) => test.command);
  const declaredAndPassing = claimedPassing.filter((command) => declaredCommands.includes(command));

  // A failed optional command is a notice, not a reason; every other failure still blocks, declared
  // required or not — the conservative default does not relax for an undeclared command.
  const blockingFailures: string[] = [];
  for (const test of record.tests) {
    if (test.status !== "failed") continue;
    if (optionalCommands.includes(test.command)) {
      notices.push(`Optional command \`${test.command}\` failed; it does not block approval.`);
    } else {
      blockingFailures.push(test.command);
    }
  }
  if (blockingFailures.length > 0) {
    reasons.push(`Judge record contains failed validation: ${blockingFailures.join(", ")}.`);
  }

  if (record.verdict === "APPROVED") {
    if (declaration.kind === "documentation") {
      // Zero commands with a non-empty reason: no runtime claim to verify.
    } else {
      if (claimedPassing.length === 0) {
        reasons.push("APPROVED requires at least one validation command that passed.");
      }
      // Named even when nothing passed at all, so the reader sees which commands are outstanding
      // rather than only that the set was empty.
      const missing = requiredCommands.filter((command) => !claimedPassing.includes(command));
      // Every command optional still leaves the evidence rule: an invented command is not evidence
      // that any declared command ran. When a required command is already named as missing, that
      // reason carries the same fact.
      if (missing.length === 0 && declaredCommands.length > 0 && declaredAndPassing.length === 0) {
        reasons.push(
          `APPROVED requires a passing run of a command the task capsule declares: ${declaredCommands.join(", ")}.`,
        );
      }
      if (missing.length > 0) {
        reasons.push(
          `APPROVED requires every command the task capsule declares as required to pass; these did not: ${missing.join(", ")}.`,
        );
      }
      if (declaration.sectionPresent && declaredCommands.length === 0) {
        // The capsule was generated with a `## Validation` section, so the commands were meant to be
        // filled in. An empty or malformed block is an unfinished capsule, not a legacy one.
        reasons.push("The task capsule has an empty or malformed `## Validation` block; declare the commands.");
      }
    }
    if (record.issues.length > 0) reasons.push("APPROVED records must not list unresolved issues.");
  }

  const reexecuted: JudgeVerifyResult["reexecuted"] = [];
  if (options.runTests) {
    if (declaredAndPassing.length === 0) {
      reasons.push("--run-tests found no capsule-declared command claimed as passing to re-execute.");
    }
    if (!snapshot) {
      reasons.push(SNAPSHOT_REQUIRED_REASON);
    } else if (
      !(await measureJudgePhase(
        "approval-wait",
        async () => options.approve?.([...declaredAndPassing]),
        undefined,
        Boolean,
      ))
    ) {
      reasons.push(withheldReason(declaredAndPassing));
    } else {
      let cleanup: (() => Promise<void>) | undefined;
      try {
        const validationWorkspace = await createJudgeSnapshotValidationWorkspace(cwd, record.scope.candidate);
        const validationCwd = validationWorkspace.worktreePath;
        cleanup = validationWorkspace.cleanup;
        for (const [index, command] of [...new Set(declaredAndPassing)].entries()) {
          const normalized = sanitizeValidationCommand(command);
          try {
            await measureJudgePhase(
              "validation-command",
              () => execAsync(command, { cwd: validationCwd, timeout: 15 * 60_000, maxBuffer: 64 * 1024 * 1024 }),
              index + 1,
            );
            reexecuted.push({ command: normalized, passed: true });
          } catch (error) {
            const evidence = captureValidationError(command, error);
            reexecuted.push({ command: normalized, passed: false, evidence });
            reasons.push(
              `Independent re-run of \`${evidence.command}\` failed (exit code ${evidence.exitCode ?? "unknown"}); the record claims it passed.`,
            );
          }
        }
        if (reexecuted.length > 0) {
          const drifted = await snapshotValidationDrift(validationCwd, snapshot.metadata.sourceScope);
          if (drifted.length > 0) {
            reasons.push(
              `Validation changed the snapshot boundary in its disposable workspace: ${drifted.join(", ")} no longer match the reviewed boundary.`,
            );
          }
        }
      } catch (error) {
        reasons.push(`Cannot create or inspect the validation workspace: ${messageOf(error)}`);
      } finally {
        await cleanup?.();
      }
    }
  }

  // Reported, never enforced: see the `notices` field on JudgeVerifyResult.
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

  let verifiedNowValue: JudgeVerifyResult["verifiedNow"]["value"];
  let verifiedNowReason: string;
  if (declaration.kind === "documentation") {
    verifiedNowValue = "not-applicable-to-runtime";
    verifiedNowReason = declaration.reason ?? "The task capsule declares no-runtime-validation.";
  } else if (!declaration.sectionPresent) {
    verifiedNowValue = "unknown";
    verifiedNowReason = "The task capsule predates the `## Validation` section.";
  } else if (reasons.length === 0 && (reviewBoundary === null || reviewBoundary === "CURRENT")) {
    verifiedNowValue = "complete";
    verifiedNowReason = "Every required validation command passed and the review still matches the current boundary.";
  } else {
    verifiedNowValue = "incomplete";
    verifiedNowReason =
      reasons[0] ??
      `The current workspace no longer matches the reviewed boundary (reviewBoundary: ${reviewBoundary}).`;
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
    historicalVerdict: {
      value: record.verdict,
      independence: recordIndependence,
      scopeDigest: record.scope.scopeDigest,
      codeReviewContentDigest: snapshot?.metadata.reviewContentDigest ?? null,
    },
    verifiedNow: {
      value: verifiedNowValue,
      reason: verifiedNowReason,
      reviewBoundary,
      executionMetadata,
    },
  };
}

async function snapshotValidationDrift(cwd: string, before: JudgeScope): Promise<string[]> {
  let after: JudgeScope;
  try {
    after = await createJudgeScope(cwd, before.taskId, before.base, "WORKTREE", before.includedTaskIds);
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
  /** All declared commands, required and optional, in order and deduplicated. */
  commands: string[];
  checks: Array<{ command: string; required: boolean }>;
  kind: "runtime" | "documentation";
  reason: string | null;
}

const OPTIONAL_SUFFIX = /\s+#\s*optional\s*$/i;
const NO_RUNTIME_VALIDATION = /^no-runtime-validation:\s*(.*)$/;

/**
 * Commands listed in the fenced block under `## Validation` in the capsule's task.md.
 *
 * `sectionPresent` distinguishes a legacy capsule that predates the section, which falls back to
 * the weaker "any passing command" rule, from a current capsule whose block was left empty or
 * malformed — that one is an unfinished capsule and must not silently weaken the gate.
 */
export async function readValidationDeclaration(cwd: string, taskId: string): Promise<ValidationDeclaration> {
  const absent: ValidationDeclaration = {
    sectionPresent: false,
    commands: [],
    checks: [],
    kind: "runtime",
    reason: null,
  };
  let taskMarkdown: string;
  try {
    taskMarkdown = await readFile(path.join(await resolveTaskRoot(cwd, taskId), "task.md"), "utf8");
  } catch {
    return absent;
  }
  const section = /\n##\s+Validation\s*\n([\s\S]*?)(?=\n##\s|$)/.exec(taskMarkdown);
  if (!section) return absent;
  const fence = /```[^\n]*\n([\s\S]*?)```/.exec(section[1]);
  if (!fence) return { sectionPresent: true, commands: [], checks: [], kind: "runtime", reason: null };

  const rawLines = fence[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  if (rawLines.length === 1) {
    const noRuntime = NO_RUNTIME_VALIDATION.exec(rawLines[0]);
    const reason = noRuntime?.[1].trim();
    if (reason) {
      return {
        sectionPresent: true,
        commands: [],
        checks: [],
        kind: "documentation",
        reason,
      };
    }
  }

  // A Map preserves first-seen order and drops later duplicates, matching the pre-existing
  // dedup behaviour of `commands` while also carrying the required flag of the first occurrence.
  const seen = new Map<string, boolean>();
  for (const line of rawLines) {
    const optional = OPTIONAL_SUFFIX.test(line);
    const command = optional ? line.replace(OPTIONAL_SUFFIX, "") : line;
    if (!seen.has(command)) seen.set(command, !optional);
  }
  const checks = [...seen.entries()].map(([command, required]) => ({ command, required }));
  const commands = checks.map((check) => check.command);
  return { sectionPresent: true, commands, checks, kind: "runtime", reason: null };
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
  return entries.filter((entry) => !NONE_VARIANT_RE.test(entry));
}

/**
 * A bullet whose full text is a short "none" variant, optionally followed by one closing
 * word from a fixed list ("None recorded yet.", the template's shipped placeholder, is the
 * `recorded yet` case) and nothing but trailing punctuation or spaces. Deliberately narrower
 * than an open sentence, so a bullet that starts with "None" but continues with real content
 * (`None of the callers validate X`) still counts.
 */
const NONE_VARIANT_RE =
  /^(none|ninguna|ninguno|n\/a)(\s+(remaining|left|yet|recorded\s+yet|so\s+far|open|pending))?[\s.!]*$/i;

export function validateRecord(value: unknown): string[] {
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
    "baseRef",
    "candidate",
    "baseCommit",
    "candidateCommit",
    "changedFiles",
    "emptyBoundaryAuthorized",
    "excludedPaths",
    "includedTaskIds",
    "taskDigest",
    "changeDigest",
    "scopeDigest",
  ];
  const requiredKeys = keys.filter((key) => key !== "baseRef");
  if (Object.keys(scope).some((key) => !keys.includes(key)) || requiredKeys.some((key) => !(key in scope)))
    return false;
  const digestPattern = /^sha256:[0-9a-f]{64}$/;
  const commitPattern = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
  return (
    scope.schemaVersion === JUDGE_SCHEMA_VERSION &&
    typeof scope.cliVersion === "string" &&
    scope.cliVersion.length > 0 &&
    typeof scope.taskId === "string" &&
    /^TASK-[0-9]+$/.test(scope.taskId) &&
    typeof scope.base === "string" &&
    commitPattern.test(scope.base) &&
    (scope.baseRef === undefined || (typeof scope.baseRef === "string" && scope.baseRef.length > 0)) &&
    typeof scope.candidate === "string" &&
    scope.candidate.length > 0 &&
    typeof scope.baseCommit === "string" &&
    commitPattern.test(scope.baseCommit) &&
    typeof scope.candidateCommit === "string" &&
    commitPattern.test(scope.candidateCommit) &&
    Array.isArray(scope.changedFiles) &&
    scope.changedFiles.every((item) => typeof item === "string") &&
    new Set(scope.changedFiles).size === scope.changedFiles.length &&
    typeof scope.emptyBoundaryAuthorized === "boolean" &&
    Array.isArray(scope.excludedPaths) &&
    scope.excludedPaths.every((item) => typeof item === "string") &&
    new Set(scope.excludedPaths).size === scope.excludedPaths.length &&
    Array.isArray(scope.includedTaskIds) &&
    scope.includedTaskIds.every((item) => typeof item === "string" && /^TASK-[0-9]+$/.test(item)) &&
    new Set(scope.includedTaskIds).size === scope.includedTaskIds.length &&
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

function identityScope(
  scope: Omit<JudgeScope, "scopeDigest"> | JudgeScope,
): Omit<JudgeScope, "scopeDigest" | "baseRef"> {
  const { scopeDigest: _ignored, baseRef: _diagnostic, ...identity } = scope as JudgeScope;
  return identity;
}

function requireTaskId(taskId: string): void {
  if (!/^TASK-[0-9]+$/.test(taskId)) throw new Error(`Invalid task ID: ${taskId}`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
