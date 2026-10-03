import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { matchesBlockedPattern, readBlockedPatterns } from "./judge-enforcement.js";
import { loadJudgeSnapshot } from "./judge-snapshot.js";

const JUDGE_ROOT = ".akrctx/local/judge";
const TASK_ID = /^TASK-[0-9]+$/;
const TASK_DIRECTORY = TASK_ID;
const VERDICTS = ["APPROVED", "NEEDS_CHANGES", "BLOCKED"] as const;
const SCOPE_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SNAPSHOT_CANDIDATE = /^SNAPSHOT:[0-9a-f]{20}$/;
/** A date-time must carry its own offset. A bare one would be read in the host time zone. */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

type Verdict = (typeof VERDICTS)[number];
type TaskState = "closed" | "open" | "unknown";
type RoundCategory = "ordinary" | "catch-up" | "unknown";

export interface JudgeRound {
  reviewedAt: string;
  scopeDigest: string;
  verdict: Verdict | null;
  independent: boolean | null;
  category: RoundCategory;
  ambiguous: boolean;
  files: string[];
}

export interface JudgeRoundsTask {
  taskId: string;
  state: TaskState;
  rounds: JudgeRound[];
}

export interface JudgeRoundsGroup {
  taskCount: number;
  roundCount: number;
  mean: number | null;
  max: number | null;
}

export interface JudgeRoundsDiagnostic {
  taskId: string | null;
  files: string[];
  reason: string;
}

export interface JudgeRoundsReport {
  tasks: JudgeRoundsTask[];
  closed: JudgeRoundsGroup;
  open: JudgeRoundsGroup;
  unknown: JudgeRoundsDiagnostic[];
  skipped: Array<{ file: string; reason: string }>;
}

interface SkippedFile {
  file: string;
  reason: string;
  /** Used only to apply the task filter. It is never part of the report. */
  taskId: string | null;
}

interface ParsedRecord {
  file: string;
  taskId: string;
  verdict: Verdict;
  independent: boolean | null;
  /** Canonical `id:status` list, or null when the record supplies no per-criterion results. */
  criteria: string | null;
  instant: number | null;
  scopeDigest: string | null;
  candidate: string | null;
}

/**
 * Counts review rounds from the local judge records. Read-only: it lists, stats and reads files
 * and never writes, renames or deletes anything.
 */
export async function collectJudgeRounds(cwd: string, taskFilter?: string): Promise<JudgeRoundsReport> {
  if (taskFilter !== undefined && !TASK_ID.test(taskFilter)) {
    throw new Error(`The task filter must look like TASK-001, got ${JSON.stringify(taskFilter)}.`);
  }
  const blocked = await readBlockedPatterns(cwd);
  const skipped: SkippedFile[] = [];
  const candidates = await discoverFiles(cwd, blocked, skipped);

  const records: ParsedRecord[] = [];
  for (const file of candidates) {
    const parsed = await parseRecord(cwd, file);
    if ("reason" in parsed) skipped.push(parsed);
    else records.push(parsed);
  }

  const unknown: JudgeRoundsDiagnostic[] = [];
  const categories = new SnapshotCategories(cwd);
  const byTask = new Map<string, ParsedRecord[]>();
  for (const record of records) {
    if (taskFilter !== undefined && record.taskId !== taskFilter) continue;
    byTask.set(record.taskId, [...(byTask.get(record.taskId) ?? []), record]);
  }

  const tasks: JudgeRoundsTask[] = [];
  for (const [taskId, taskRecords] of byTask) {
    tasks.push(await buildTask(taskId, taskRecords, categories, unknown));
  }
  tasks.sort((left, right) => compareText(left.taskId, right.taskId));

  return {
    tasks,
    closed: aggregate(tasks, "closed"),
    open: aggregate(tasks, "open"),
    unknown: unknown.sort(
      (left, right) =>
        compareText(left.files.join("\n"), right.files.join("\n")) ||
        compareText(left.reason, right.reason) ||
        compareText(left.taskId ?? "", right.taskId ?? ""),
    ),
    skipped: skipped
      .filter((entry) => taskFilter === undefined || entry.taskId === null || entry.taskId === taskFilter)
      .map(({ file, reason }) => ({ file, reason }))
      .sort((left, right) => compareText(left.file, right.file) || compareText(left.reason, right.reason)),
  };
}

async function discoverFiles(cwd: string, blocked: string[], skipped: SkippedFile[]): Promise<string[]> {
  const found: string[] = [];
  const walk = async (relativeDir: string, top: boolean): Promise<void> => {
    let names: string[];
    try {
      names = await readdir(path.join(cwd, relativeDir));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" && top) return;
      skipped.push({
        file: relativeDir,
        reason: `unattributable: cannot list directory: ${messageOf(error)}`,
        taskId: null,
      });
      return;
    }
    for (const name of names.sort()) {
      const relative = `${relativeDir}/${name}`;
      const info = await lstat(path.join(cwd, relative));
      if (info.isDirectory() && top && name === "snapshots") continue;
      if (blocked.some((pattern) => matchesBlockedPattern(relative, pattern))) {
        skipped.push({
          file: relative,
          reason: "unattributable: blocked by policy.json blockedReadPatterns",
          taskId: null,
        });
      } else if (info.isSymbolicLink()) {
        skipped.push({ file: relative, reason: "unattributable: symbolic link, not followed", taskId: null });
      } else if (info.isDirectory()) {
        if (top && (name === "records" || TASK_DIRECTORY.test(name))) await walk(relative, false);
        else
          skipped.push({
            file: relative,
            reason: "unattributable: directory is not a TASK-<n> directory or records/, not traversed",
            taskId: null,
          });
      } else if (info.isFile()) {
        found.push(relative);
      } else {
        skipped.push({ file: relative, reason: "unattributable: not a regular file", taskId: null });
      }
    }
  };
  await walk(JUDGE_ROOT, true);
  return found;
}

async function parseRecord(cwd: string, file: string): Promise<ParsedRecord | SkippedFile> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path.join(cwd, file), "utf8"));
  } catch (error) {
    const reason = error instanceof SyntaxError ? "not valid JSON" : `cannot read file: ${messageOf(error)}`;
    return { file, reason: `unattributable: ${reason}`, taskId: null };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { file, reason: "unattributable: not a JSON object", taskId: null };
  }
  const record = value as Record<string, unknown>;
  const taskId = typeof record.taskId === "string" && TASK_ID.test(record.taskId) ? record.taskId : null;
  const verdict = VERDICTS.find((candidate) => candidate === record.verdict);
  if (!taskId) {
    return { file, reason: "unattributable: not a review record, taskId is missing or invalid", taskId: null };
  }
  if (!verdict) {
    return { file, reason: `not a review record, verdict is missing or invalid (taskId ${taskId})`, taskId };
  }
  const scope = record.scope && typeof record.scope === "object" ? (record.scope as Record<string, unknown>) : {};
  return {
    file,
    taskId,
    verdict,
    independent: typeof record.independent === "boolean" ? record.independent : null,
    criteria: canonicalCriteria(record.criteria),
    instant: parseInstant(record.reviewedAt),
    scopeDigest:
      typeof scope.scopeDigest === "string" && SCOPE_DIGEST.test(scope.scopeDigest) ? scope.scopeDigest : null,
    candidate: typeof scope.candidate === "string" ? scope.candidate : null,
  };
}

function parseInstant(value: unknown): number | null {
  if (typeof value !== "string" || !INSTANT.test(value)) return null;
  const instant = Date.parse(value);
  return Number.isNaN(instant) ? null : instant;
}

function canonicalCriteria(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const entries: string[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { id, status } = entry as Record<string, unknown>;
    if (typeof id === "string" && typeof status === "string") entries.push(`${id}:${status}`);
  }
  return entries.sort().join(",");
}

async function buildTask(
  taskId: string,
  records: ParsedRecord[],
  categories: SnapshotCategories,
  unknown: JudgeRoundsDiagnostic[],
): Promise<JudgeRoundsTask> {
  const groups = new Map<string, ParsedRecord[]>();
  const uncountable: ParsedRecord[] = [];
  for (const record of records) {
    if (record.instant === null || record.scopeDigest === null) {
      uncountable.push(record);
      const missing = [
        record.instant === null ? "reviewedAt is missing or not an ISO date-time with an offset" : null,
        record.scopeDigest === null ? "scope.scopeDigest is missing or invalid" : null,
      ].filter((reason): reason is string => reason !== null);
      unknown.push({
        taskId,
        files: [record.file],
        reason: `uncountable record, no stable round key: ${missing.join("; ")}`,
      });
      continue;
    }
    const key = `${record.instant}|${record.scopeDigest}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  const rounds: Array<JudgeRound & { instant: number }> = [];
  for (const group of groups.values()) {
    const files = group.map((record) => record.file).sort();
    const conflicts = [
      differs(group, (record) => record.verdict) ? "verdict" : null,
      differs(group, (record) => String(record.independent)) ? "independence" : null,
      differs(group, (record) => record.criteria ?? "\0absent") ? "criterion statuses" : null,
    ].filter((name): name is string => name !== null);
    if (conflicts.length) {
      unknown.push({ taskId, files, reason: `conflicting evidence for one round: ${conflicts.join(", ")}` });
    }
    const category = await categories.of(group, taskId, files, unknown);
    const first = group[0];
    rounds.push({
      instant: first.instant as number,
      reviewedAt: new Date(first.instant as number).toISOString(),
      scopeDigest: first.scopeDigest as string,
      verdict: conflicts.includes("verdict") ? null : first.verdict,
      independent: conflicts.includes("independence") ? null : first.independent,
      category,
      ambiguous: conflicts.length > 0,
      files,
    });
  }
  rounds.sort((left, right) => left.instant - right.instant || compareText(left.scopeDigest, right.scopeDigest));

  const state = taskState(taskId, rounds, uncountable, unknown);
  return { taskId, state, rounds: rounds.map(({ instant: _instant, ...round }) => round) };
}

function taskState(
  taskId: string,
  rounds: Array<JudgeRound & { instant: number }>,
  uncountable: ParsedRecord[],
  unknown: JudgeRoundsDiagnostic[],
): TaskState {
  const uncertain = (files: string[], reason: string): TaskState => {
    unknown.push({ taskId, files: files.sort(), reason: `task state is unknown: ${reason}` });
    return "unknown";
  };
  if (uncountable.length) {
    return uncertain(
      uncountable.map((record) => record.file),
      "an uncountable record can hide a round",
    );
  }
  if (rounds.length === 0) return "unknown";
  const latestInstant = rounds[rounds.length - 1].instant;
  const latest = rounds.filter((round) => round.instant === latestInstant);
  const files = latest.flatMap((round) => round.files);
  if (latest.some((round) => round.ambiguous)) return uncertain(files, "the latest round is ambiguous");
  if (new Set(latest.map((round) => round.verdict)).size > 1) {
    return uncertain(files, "rounds at the latest instant disagree on the verdict");
  }
  return latest[0].verdict === "APPROVED" ? "closed" : "open";
}

function differs(group: ParsedRecord[], pick: (record: ParsedRecord) => string): boolean {
  return new Set(group.map(pick)).size > 1;
}

/**
 * Reads catch-up lineage from snapshot metadata through `loadJudgeSnapshot`, which applies the
 * blocked-read policy and rejects a snapshot that no longer matches its capture. Anything it
 * cannot confirm stays `unknown`; the category is never guessed from a record's name.
 */
class SnapshotCategories {
  private readonly cache = new Map<string, Promise<{ category: RoundCategory; reason?: string }>>();

  constructor(private readonly cwd: string) {}

  async of(
    group: ParsedRecord[],
    taskId: string,
    files: string[],
    unknown: JudgeRoundsDiagnostic[],
  ): Promise<RoundCategory> {
    const candidates = [...new Set(group.map((record) => record.candidate ?? ""))];
    const results = await Promise.all(candidates.map((candidate) => this.classify(candidate)));
    const categories = new Set(results.map((result) => result.category));
    if (categories.size === 1 && !categories.has("unknown")) return results[0].category;
    const reasons = [...new Set(results.map((result) => result.reason).filter((reason) => reason !== undefined))];
    unknown.push({
      taskId,
      files,
      reason: `round category unknown: ${categories.size > 1 ? "copies disagree on the boundary" : (reasons[0] ?? "no boundary metadata")}`,
    });
    return "unknown";
  }

  private classify(candidate: string) {
    let result = this.cache.get(candidate);
    if (!result) {
      result = this.load(candidate);
      this.cache.set(candidate, result);
    }
    return result;
  }

  private async load(candidate: string): Promise<{ category: RoundCategory; reason?: string }> {
    if (!SNAPSHOT_CANDIDATE.test(candidate)) {
      return { category: "unknown", reason: "the boundary is not a snapshot, so no catch-up metadata exists" };
    }
    try {
      const snapshot = await loadJudgeSnapshot(this.cwd, candidate);
      return { category: snapshot.metadata.parent ? "catch-up" : "ordinary" };
    } catch (error) {
      return { category: "unknown", reason: `snapshot metadata unavailable (${messageOf(error)})` };
    }
  }
}

function aggregate(tasks: JudgeRoundsTask[], state: "closed" | "open"): JudgeRoundsGroup {
  const counts = tasks.filter((task) => task.state === state).map((task) => task.rounds.length);
  if (counts.length === 0) return { taskCount: 0, roundCount: 0, mean: null, max: null };
  const total = counts.reduce((sum, count) => sum + count, 0);
  return {
    taskCount: counts.length,
    roundCount: total,
    mean: Math.round((total / counts.length) * 100) / 100,
    max: Math.max(...counts),
  };
}

export function renderJudgeRounds(report: JudgeRoundsReport): string[] {
  const lines: string[] = ["Judge rounds", ""];
  for (const [label, group] of [
    ["closed", report.closed],
    ["open", report.open],
  ] as const) {
    lines.push(
      `${label}: taskCount ${group.taskCount}, roundCount ${group.roundCount}, mean ${group.mean ?? "null"}, max ${group.max ?? "null"}`,
    );
  }
  lines.push("", `tasks (${report.tasks.length}):`);
  if (report.tasks.length === 0) lines.push("  none");
  for (const task of report.tasks) {
    lines.push(`  ${task.taskId} state ${task.state}, ${task.rounds.length} rounds`);
    for (const round of task.rounds) {
      lines.push(
        `    ${round.reviewedAt} ${round.scopeDigest}`,
        `      verdict ${round.verdict ?? "null"}, independent ${round.independent ?? "null"}, category ${round.category}, ambiguous ${round.ambiguous}`,
        `      files: ${round.files.join(", ")}`,
      );
    }
  }
  lines.push("", `unknown (${report.unknown.length}):`);
  if (report.unknown.length === 0) lines.push("  none");
  for (const entry of report.unknown) {
    lines.push(`  ${entry.taskId ?? "null"} ${entry.reason}`, `    files: ${entry.files.join(", ")}`);
  }
  lines.push("", `skipped (${report.skipped.length}):`);
  if (report.skipped.length === 0) lines.push("  none");
  for (const entry of report.skipped) lines.push(`  ${entry.file}: ${entry.reason}`);
  return lines;
}

function compareText(left: string, right: string): number {
  return left.localeCompare(right, "en", { numeric: true });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
