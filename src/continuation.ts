import { createHash } from "node:crypto";
import { constants, type Dirent } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import path from "node:path";
import { matchesBlockedPattern, readBlockedPatterns } from "./judge-enforcement.js";

export const CONTINUATION_SCHEMA_VERSION = 1 as const;
export const CONTINUATION_MAX_BYTES = 65536;

export type ContinuationStatus = "missing" | "valid" | "invalid" | "unsupported";
export type ExecutionState =
  | "planned"
  | "ready"
  | "active"
  | "blocked"
  | "handoff-requested"
  | "completed"
  | "abandoned"
  | "superseded";

export interface ContinuationTask {
  taskId: string;
  capsulePath: string;
  capsuleDigest: string;
  capsuleRevision: { gitCommit: string | null };
}

export interface ContinuationWorkspaceContentUnavailable {
  kind: "unavailable";
}

export interface ContinuationWorkspaceSnapshot {
  kind: "judge-snapshot";
  snapshotId: string;
  reviewContentDigest: string;
  availability: "verified" | "unavailable";
}

export type ContinuationWorkspaceContent = ContinuationWorkspaceContentUnavailable | ContinuationWorkspaceSnapshot;

export interface ContinuationExecution {
  runId: string;
  state: ExecutionState;
  workspace: {
    gitRemote: string;
    commit: string | null;
    content: ContinuationWorkspaceContent;
  };
  owner: { kind: "orchestrator" | "manual-session"; id: string };
  model: { requested: string; observed: string };
  progress: string[];
  blockers: string[];
  decisionsPending: string[];
  attempts: {
    budgetAccountId: string;
    consumed: number | "unknown";
    limit: number;
    provenance: "portable-summary" | "legacy-local-log" | "unknown";
    localReconciliation: "not-available" | "reconciled" | "conflict";
  };
  validationSummary: {
    contractDigest: string;
    codeReviewContentDigest: string | null;
    required: Array<{ command: string; status: "passed" | "failed" | "not-run" }>;
    status: "unknown" | "incomplete" | "complete" | "not-applicable-to-runtime";
    reason?: string;
  };
  resumption: { requiresReauthorization: true; reason: string };
}

export interface ContinuationRecord {
  schemaVersion: typeof CONTINUATION_SCHEMA_VERSION;
  task: ContinuationTask;
  latestExecution: ContinuationExecution | null;
  history: ContinuationExecution[];
}

export interface TaskContinuationResult {
  taskId: string;
  path: string;
  status: ContinuationStatus;
  executionState: ExecutionState | "unknown";
  permission: "not-evaluated";
  verification: "not-evaluated";
  continuationDigest: string | null;
  record: ContinuationRecord | null;
  reasons: string[];
}

const executionStates = new Set<ExecutionState>([
  "planned",
  "ready",
  "active",
  "blocked",
  "handoff-requested",
  "completed",
  "abandoned",
  "superseded",
]);
const terminalStates = new Set<ExecutionState>(["completed", "abandoned", "superseded"]);
const digestPattern = /^sha256:[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const taskIdPattern = /^TASK-[0-9]+$/;
const runIdPattern = /^run_[A-Za-z0-9_-]{1,80}$/;
const budgetIdPattern = /^budget_[A-Za-z0-9_-]{1,80}$/;
const snapshotIdPattern = /^SNAPSHOT:[A-Za-z0-9_-]{1,128}$/;

/** Return structural reasons without throwing or echoing input values. */
export function validateContinuation(value: unknown): string[] {
  const reasons: string[] = [];
  if (!isObject(value)) return ["Continuation root must be an object."];
  exactKeys(value, ["schemaVersion", "task", "latestExecution", "history"], "root", reasons);
  if (value.schemaVersion !== CONTINUATION_SCHEMA_VERSION) reasons.push("schemaVersion must be integer 1.");

  validateTask(value.task, reasons);
  if (value.latestExecution !== null) validateExecution(value.latestExecution, "latestExecution", reasons, false);
  if (!isArray(value.history)) {
    reasons.push("history must be an array.");
  } else {
    if (value.history.length > 20) reasons.push("history exceeds the maximum of 20 entries.");
    const historyRuns = new Set<string>();
    for (let index = 0; index < value.history.length; index += 1) {
      validateExecution(value.history[index], `history[${index}]`, reasons, true);
      const execution = value.history[index];
      if (isObject(execution) && typeof execution.runId === "string") {
        if (historyRuns.has(execution.runId)) reasons.push("history runIds must be unique.");
        historyRuns.add(execution.runId);
      }
    }
    if (isObject(value.latestExecution) && typeof value.latestExecution.runId === "string") {
      if (historyRuns.has(value.latestExecution.runId))
        reasons.push("history runIds must differ from latestExecution.");
    }
  }
  return reasons;
}

/**
 * Read the one optional continuation sidecar for a task. This function deliberately has no
 * writer or migration path: absence is a normal legacy result and malformed input remains
 * observable as invalid.
 */
export async function readTaskContinuation(cwd: string, taskId: string): Promise<TaskContinuationResult> {
  if (!taskIdPattern.test(taskId)) throw new Error("Invalid task ID.");

  const akrctxRoot = path.join(cwd, ".akrctx");
  await requireRealDirectory(akrctxRoot, ".akrctx");
  const tasksRoot = path.join(akrctxRoot, "tasks");
  await requireRealDirectory(tasksRoot, ".akrctx/tasks");

  const taskDirName = await resolveTaskDirectory(tasksRoot, taskId);
  if (taskDirName.includes("\\") || taskDirName === "." || taskDirName === "..") {
    throw new Error("Task directory has an invalid path.");
  }
  const taskDir = path.join(tasksRoot, taskDirName);
  await requireRealDirectory(taskDir, `.akrctx/tasks/${taskDirName}`);

  const policyPath = path.join(akrctxRoot, "policy.json");
  await requireRegularFile(policyPath, ".akrctx/policy.json", true);
  // Load and validate policy before inspecting the sidecar. readBlockedPatterns fails closed.
  const blockedPatterns = await readBlockedPatterns(cwd);

  const relativeSidecar = path.posix.join(".akrctx/tasks", taskDirName, "continuation.json");
  if (blockedPatterns.some((pattern) => matchesBlockedPattern(relativeSidecar, pattern))) {
    throw new Error("Continuation sidecar is blocked by policy.");
  }
  const sidecar = path.join(taskDir, "continuation.json");
  const resultBase = {
    taskId,
    path: relativeSidecar,
    permission: "not-evaluated" as const,
    verification: "not-evaluated" as const,
  };

  const sidecarInfo = await lstat(sidecar).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw new Error(`Cannot inspect continuation sidecar: ${messageOf(error)}`);
  });
  if (!sidecarInfo) {
    return {
      ...resultBase,
      status: "missing",
      executionState: "unknown",
      continuationDigest: null,
      record: null,
      reasons: [],
    };
  }
  if (sidecarInfo.isSymbolicLink()) throw new Error("Cannot read continuation sidecar through symbolic link.");
  if (!sidecarInfo.isFile()) throw new Error("Continuation sidecar is not a regular file.");

  let bytes: Buffer;
  try {
    const handle = await open(sidecar, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const openedInfo = await handle.stat();
      if (!openedInfo.isFile()) throw new Error("Continuation sidecar is not a regular file.");
      const buffer = Buffer.alloc(CONTINUATION_MAX_BYTES + 1);
      let offset = 0;
      while (offset < buffer.length) {
        const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      bytes = buffer.subarray(0, offset);
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Continuation sidecar is not a regular file.") throw error;
    throw new Error(`Cannot read continuation sidecar: ${messageOf(error)}`);
  }

  if (bytes.length > CONTINUATION_MAX_BYTES) {
    return {
      ...resultBase,
      status: "invalid",
      executionState: "unknown",
      continuationDigest: null,
      record: null,
      reasons: ["Continuation sidecar exceeds the maximum size."],
    };
  }

  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return invalidResult(resultBase, ["Continuation sidecar is not valid UTF-8."]);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch {
    return invalidResult(resultBase, ["Continuation sidecar is not valid JSON."]);
  }
  if (
    isObject(parsed) &&
    Number.isInteger(parsed.schemaVersion) &&
    parsed.schemaVersion !== CONTINUATION_SCHEMA_VERSION
  ) {
    return {
      ...resultBase,
      status: "unsupported",
      executionState: "unknown",
      continuationDigest: null,
      record: null,
      reasons: ["Continuation schema version is unsupported."],
    };
  }
  const reasons = validateContinuation(parsed);
  if (reasons.length === 0 && isObject(parsed)) {
    const record = parsed as unknown as ContinuationRecord;
    if (record.task.taskId !== taskId) reasons.push("task.taskId does not match the requested task.");
    if (record.task.capsulePath !== path.posix.join(".akrctx/tasks", taskDirName))
      reasons.push("task.capsulePath does not match the resolved task directory.");
  }
  if (reasons.length > 0) return invalidResult(resultBase, reasons);
  const record = parsed as unknown as ContinuationRecord;
  return {
    ...resultBase,
    status: "valid",
    executionState: record.latestExecution?.state ?? "unknown",
    continuationDigest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    record,
    reasons: [],
  };
}

function invalidResult(
  base: Pick<TaskContinuationResult, "taskId" | "path" | "permission" | "verification">,
  reasons: string[],
): TaskContinuationResult {
  return { ...base, status: "invalid", executionState: "unknown", continuationDigest: null, record: null, reasons };
}

function validateTask(value: unknown, reasons: string[]): void {
  if (!isObject(value)) {
    reasons.push("task must be an object.");
    return;
  }
  exactKeys(value, ["taskId", "capsulePath", "capsuleDigest", "capsuleRevision"], "task", reasons);
  if (!taskIdPattern.test(stringValue(value.taskId))) reasons.push("task.taskId has an invalid format.");
  const capsulePath = stringValue(value.capsulePath);
  if (
    capsulePath.length > 1024 ||
    !/^\.akrctx\/tasks\/TASK-[0-9]+(?:-[^/\\]+)?$/.test(capsulePath) ||
    capsulePath.split("/").some((part) => part === "." || part === "..")
  ) {
    reasons.push("task.capsulePath has an invalid format.");
  } else if (
    typeof value.taskId === "string" &&
    capsulePath !== `.akrctx/tasks/${value.taskId}` &&
    !capsulePath.startsWith(`.akrctx/tasks/${value.taskId}-`)
  ) {
    reasons.push("task.capsulePath does not match task.taskId.");
  }
  validateDigest(value.capsuleDigest, "task.capsuleDigest", reasons);
  if (!isObject(value.capsuleRevision)) {
    reasons.push("task.capsuleRevision must be an object.");
  } else {
    exactKeys(value.capsuleRevision, ["gitCommit"], "task.capsuleRevision", reasons);
    validateCommit(value.capsuleRevision.gitCommit, "task.capsuleRevision.gitCommit", reasons);
  }
}

function validateExecution(value: unknown, prefix: string, reasons: string[], history: boolean): void {
  if (!isObject(value)) {
    reasons.push(`${prefix} must be an object.`);
    return;
  }
  exactKeys(
    value,
    [
      "runId",
      "state",
      "workspace",
      "owner",
      "model",
      "progress",
      "blockers",
      "decisionsPending",
      "attempts",
      "validationSummary",
      "resumption",
    ],
    prefix,
    reasons,
  );
  if (!runIdPattern.test(stringValue(value.runId))) reasons.push(`${prefix}.runId has an invalid format.`);
  if (typeof value.state !== "string" || !executionStates.has(value.state as ExecutionState))
    reasons.push(`${prefix}.state has an invalid value.`);
  if (history && typeof value.state === "string" && !terminalStates.has(value.state as ExecutionState))
    reasons.push(`${prefix} history entries must be terminal.`);
  validateWorkspace(value.workspace, `${prefix}.workspace`, reasons);
  if (!isObject(value.owner)) {
    reasons.push(`${prefix}.owner must be an object.`);
  } else {
    exactKeys(value.owner, ["kind", "id"], `${prefix}.owner`, reasons);
    if (value.owner.kind !== "orchestrator" && value.owner.kind !== "manual-session")
      reasons.push(`${prefix}.owner.kind has an invalid value.`);
    validateFreeString(value.owner.id, `${prefix}.owner.id`, reasons);
  }
  if (!isObject(value.model)) {
    reasons.push(`${prefix}.model must be an object.`);
  } else {
    exactKeys(value.model, ["requested", "observed"], `${prefix}.model`, reasons);
    validateFreeString(value.model.requested, `${prefix}.model.requested`, reasons);
    validateFreeString(value.model.observed, `${prefix}.model.observed`, reasons);
  }
  validateStringArray(value.progress, `${prefix}.progress`, reasons);
  validateStringArray(value.blockers, `${prefix}.blockers`, reasons);
  validateStringArray(value.decisionsPending, `${prefix}.decisionsPending`, reasons);
  validateAttempts(value.attempts, `${prefix}.attempts`, reasons);
  validateValidationSummary(value.validationSummary, `${prefix}.validationSummary`, reasons);
  if (!isObject(value.resumption)) {
    reasons.push(`${prefix}.resumption must be an object.`);
  } else {
    exactKeys(value.resumption, ["requiresReauthorization", "reason"], `${prefix}.resumption`, reasons);
    if (value.resumption.requiresReauthorization !== true)
      reasons.push(`${prefix}.resumption.requiresReauthorization must be true.`);
    validateReason(value.resumption.reason, `${prefix}.resumption.reason`, reasons);
  }
}

function validateWorkspace(value: unknown, prefix: string, reasons: string[]): void {
  if (!isObject(value)) {
    reasons.push(`${prefix} must be an object.`);
    return;
  }
  exactKeys(value, ["gitRemote", "commit", "content"], prefix, reasons);
  validateFreeString(value.gitRemote, `${prefix}.gitRemote`, reasons);
  validateCommit(value.commit, `${prefix}.commit`, reasons);
  if (!isObject(value.content)) {
    reasons.push(`${prefix}.content must be an object.`);
    return;
  }
  if (value.content.kind === "unavailable") {
    exactKeys(value.content, ["kind"], `${prefix}.content`, reasons);
  } else if (value.content.kind === "judge-snapshot") {
    exactKeys(
      value.content,
      ["kind", "snapshotId", "reviewContentDigest", "availability"],
      `${prefix}.content`,
      reasons,
    );
    if (!snapshotIdPattern.test(stringValue(value.content.snapshotId)))
      reasons.push(`${prefix}.content.snapshotId has an invalid format.`);
    validateDigest(value.content.reviewContentDigest, `${prefix}.content.reviewContentDigest`, reasons);
    if (value.content.availability !== "verified" && value.content.availability !== "unavailable")
      reasons.push(`${prefix}.content.availability has an invalid value.`);
  } else {
    reasons.push(`${prefix}.content.kind has an invalid value.`);
  }
}

function validateAttempts(value: unknown, prefix: string, reasons: string[]): void {
  if (!isObject(value)) {
    reasons.push(`${prefix} must be an object.`);
    return;
  }
  exactKeys(value, ["budgetAccountId", "consumed", "limit", "provenance", "localReconciliation"], prefix, reasons);
  if (!budgetIdPattern.test(stringValue(value.budgetAccountId)))
    reasons.push(`${prefix}.budgetAccountId has an invalid format.`);
  if (
    value.consumed !== "unknown" &&
    (typeof value.consumed !== "number" || !Number.isSafeInteger(value.consumed) || value.consumed < 0)
  )
    reasons.push(`${prefix}.consumed must be a non-negative safe integer or unknown.`);
  if (!Number.isSafeInteger(value.limit) || (value.limit as number) < 1)
    reasons.push(`${prefix}.limit must be a positive safe integer.`);
  if (
    typeof value.provenance !== "string" ||
    !["portable-summary", "legacy-local-log", "unknown"].includes(value.provenance)
  )
    reasons.push(`${prefix}.provenance has an invalid value.`);
  if (
    typeof value.localReconciliation !== "string" ||
    !["not-available", "reconciled", "conflict"].includes(value.localReconciliation)
  )
    reasons.push(`${prefix}.localReconciliation has an invalid value.`);
}

function validateValidationSummary(value: unknown, prefix: string, reasons: string[]): void {
  if (!isObject(value)) {
    reasons.push(`${prefix} must be an object.`);
    return;
  }
  const allowed =
    value.status === "not-applicable-to-runtime"
      ? ["contractDigest", "codeReviewContentDigest", "required", "status", "reason"]
      : ["contractDigest", "codeReviewContentDigest", "required", "status"];
  exactKeys(value, allowed, prefix, reasons);
  validateDigest(value.contractDigest, `${prefix}.contractDigest`, reasons);
  if (value.codeReviewContentDigest !== null)
    validateDigest(value.codeReviewContentDigest, `${prefix}.codeReviewContentDigest`, reasons);
  if (!isArray(value.required)) {
    reasons.push(`${prefix}.required must be an array.`);
  } else {
    if (value.required.length > 100) reasons.push(`${prefix}.required exceeds the maximum of 100 entries.`);
    for (let index = 0; index < value.required.length; index += 1) {
      const item = value.required[index];
      if (!isObject(item)) {
        reasons.push(`${prefix}.required[${index}] must be an object.`);
        continue;
      }
      exactKeys(item, ["command", "status"], `${prefix}.required[${index}]`, reasons);
      validateFreeString(item.command, `${prefix}.required[${index}].command`, reasons);
      if (item.status !== "passed" && item.status !== "failed" && item.status !== "not-run")
        reasons.push(`${prefix}.required[${index}].status has an invalid value.`);
    }
  }
  const statuses = ["unknown", "incomplete", "complete", "not-applicable-to-runtime"];
  if (typeof value.status !== "string" || !statuses.includes(value.status))
    reasons.push(`${prefix}.status has an invalid value.`);
  if (
    value.status === "complete" &&
    (!isArray(value.required) ||
      value.required.length === 0 ||
      value.required.some((item) => !isObject(item) || item.status !== "passed") ||
      value.codeReviewContentDigest === null)
  )
    reasons.push(`${prefix}.complete requires passed commands and a code review digest.`);
  if (value.status === "not-applicable-to-runtime") {
    if (!isArray(value.required) || value.required.length !== 0)
      reasons.push(`${prefix}.not-applicable-to-runtime requires no commands.`);
    validateReason(value.reason, `${prefix}.reason`, reasons);
  }
}

function validateDigest(value: unknown, prefix: string, reasons: string[]): void {
  if (typeof value !== "string" || !digestPattern.test(value)) reasons.push(`${prefix} must be a sha256 digest.`);
}

function validateCommit(value: unknown, prefix: string, reasons: string[]): void {
  if (value !== null && (typeof value !== "string" || !commitPattern.test(value)))
    reasons.push(`${prefix} must be null or a Git commit.`);
}

function validateStringArray(value: unknown, prefix: string, reasons: string[]): void {
  if (!isArray(value)) {
    reasons.push(`${prefix} must be an array.`);
    return;
  }
  if (value.length > 100) reasons.push(`${prefix} exceeds the maximum of 100 entries.`);
  for (let index = 0; index < value.length; index += 1)
    validateFreeString(value[index], `${prefix}[${index}]`, reasons);
}

function validateFreeString(value: unknown, prefix: string, reasons: string[]): void {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024)
    reasons.push(`${prefix} must be a non-empty string of at most 1024 characters.`);
}

function validateReason(value: unknown, prefix: string, reasons: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 1024)
    reasons.push(`${prefix} must be a non-empty string of at most 1024 characters.`);
}

function exactKeys(value: Record<string, unknown>, expected: string[], prefix: string, reasons: string[]): void {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value))
    if (!expectedSet.has(key)) reasons.push(`${prefix} contains an unsupported field.`);
  for (const key of expected) if (!(key in value)) reasons.push(`${prefix} is missing a required field.`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function resolveTaskDirectory(tasksRoot: string, taskId: string): Promise<string> {
  let entries: Dirent[];
  try {
    entries = await readdir(tasksRoot, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Cannot read .akrctx/tasks: ${messageOf(error)}`);
  }
  const matches = entries.filter((entry) => entry.name === taskId || entry.name.startsWith(`${taskId}-`));
  if (matches.length === 0) throw new Error("Task not found.");
  if (matches.length > 1) throw new Error("Multiple task directories match the requested task ID.");
  if (!matches[0].isDirectory() || matches[0].isSymbolicLink())
    throw new Error("Task directory is not a real directory.");
  return matches[0].name;
}

async function requireRealDirectory(absolute: string, display: string): Promise<void> {
  const info = await lstat(absolute).catch((error: unknown) => {
    throw new Error(`Cannot inspect ${display}: ${messageOf(error)}`);
  });
  if (info.isSymbolicLink()) throw new Error(`Cannot read ${display} through symbolic link.`);
  if (!info.isDirectory()) throw new Error(`${display} is not a directory.`);
}

async function requireRegularFile(absolute: string, display: string, rejectSymlink: boolean): Promise<void> {
  const info = await lstat(absolute).catch((error: unknown) => {
    throw new Error(`Cannot inspect ${display}: ${messageOf(error)}`);
  });
  if (rejectSymlink && info.isSymbolicLink()) throw new Error(`Cannot read ${display} through symbolic link.`);
  if (!info.isFile()) throw new Error(`${display} is not a regular file.`);
}

function isMissing(error: unknown): boolean {
  return (error as { code?: unknown } | undefined)?.code === "ENOENT";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
